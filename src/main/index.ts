import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, WebContentsView, session, Notification } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { store, DndConfig, defaultServices } from './store.js'
import { loginWithGoogle, refreshGoogleToken, encryptToken, decryptToken } from './auth.js'
import { loginToFirebase, logoutFromFirebase, syncConfigToCloud, fetchConfigFromCloud, onCloudConfigChanged } from './firebase.js'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

let unsubscribeCloudSync: (() => void) | null = null;

// Helper to push current config to cloud
async function pushConfigToCloud() {
  const authState = store.get('auth');
  if (authState?.uid) {
    const config = {
      services: store.get('services'),
      dnd: store.get('dnd'),
      layout: store.get('layout')
    };
    await syncConfigToCloud(authState.uid, config);
  }
}


// Set application name and model ID for proper OS notifications and audio branding
app.setName('Gradd')
app.setAppUserModelId('com.gradd.app')

// Disable Chrome's autoplay user gesture requirement to allow web page notification sounds
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let saveTimeout: NodeJS.Timeout | null = null

const serviceViews = new Map<string, WebContentsView>()
const serviceUnreads = new Map<string, number>()
let activeServiceId: string | null = null
let contentBounds = { x: 0, y: 0, width: 0, height: 0 }
let dndActive = false

function isTimeInSchedule(current: string, start: string, end: string): boolean {
  if (start === end) return false
  if (start < end) {
    return current >= start && current < end
  } else {
    // Spans midnight (e.g. 22:00 to 08:00)
    return current >= start || current < end
  }
}

function applyDndState(): void {
  // Mute or unmute all service views based on DND active state or per-service mute settings
  const services = store.get('services') || []
  console.log(`[Main] applyDndState: evaluating mute states. dndActive=${dndActive}`)
  for (const [id, view] of serviceViews) {
    try {
      const service = services.find((s) => s.id === id)
      const isMuted = dndActive || !!(service && service.muted)
      console.log(`[Main] applyDndState: Service ${id} setAudioMuted(${isMuted}). service.muted=${service ? service.muted : undefined}`)
      view.webContents.setAudioMuted(isMuted)
    } catch (error) {
      console.error('Failed to update audio muted state for service view:', error)
    }
  }

  // Notify the React renderer of the DND status change
  if (mainWindow) {
    mainWindow.webContents.send('dnd-status-changed', dndActive)
  }

  // Update the tray menu checkbox checkmark state
  updateTrayMenu()
}

function evaluateDndState(): void {
  try {
    const dndConfig = store.get('dnd') as DndConfig
    if (!dndConfig) return

    let nextDndState = dndConfig.manualActive

    if (dndConfig.scheduleEnabled) {
      const now = new Date()
      const currentHours = String(now.getHours()).padStart(2, '0')
      const currentMinutes = String(now.getMinutes()).padStart(2, '0')
      const currentTimeString = `${currentHours}:${currentMinutes}`

      if (isTimeInSchedule(currentTimeString, dndConfig.startTime, dndConfig.endTime)) {
        nextDndState = true
      }
    }

    if (dndActive !== nextDndState) {
      dndActive = nextDndState
      applyDndState()
    }
  } catch (error) {
    console.error('Failed to evaluate DND state:', error)
  }
}

function getServiceDomains(type: string): string[] {
  switch (type) {
    case 'messenger':
      return ['messenger.com', 'facebook.com']
    case 'whatsapp':
      return ['whatsapp.com', 'whatsapp.net']
    case 'telegram':
      return ['telegram.org', 'telegram.me', 't.me']
    case 'slack':
      return ['slack.com']
    case 'instagram':
      return ['instagram.com']
    case 'gadugadu':
      return ['gg.pl']
    default:
      return []
  }
}

function saveLastVisitedUrl(serviceId: string, url: string): void {
  try {
    const services = store.get('services') || []
    const serviceIndex = services.findIndex((s) => s.id === serviceId)
    if (serviceIndex === -1) return
    const service = services[serviceIndex]

    const parsed = new URL(url)
    const hostname = parsed.hostname
    const allowedDomains = getServiceDomains(service.type)

    const isAllowed = allowedDomains.some((d) => hostname === d || hostname.endsWith('.' + d))
    if (!isAllowed) return

    if (service.url !== url) {
      service.url = url
      services[serviceIndex] = service
      store.set('services', services)
      if (mainWindow) {
        mainWindow.webContents.send('services-updated', services)
      }
    }
  } catch (error) {
    console.error(`Failed to save last visited URL for service ${serviceId}:`, error)
  }
}

function handleUnreadCountChange(serviceId: string, count: number): void {
  const currentCount = serviceUnreads.get(serviceId) || 0
  if (currentCount === count) return

  serviceUnreads.set(serviceId, count)

  // Dispatch unread update to renderer process
  if (mainWindow) {
    mainWindow.webContents.send('unread-counts-updated', { serviceId, count })
  }
}

async function scrapeUnreadCount(view: WebContentsView, type: string): Promise<number> {
  try {
    if (view.webContents.isDestroyed()) return 0

    // First try title-based unread parsing as it's standard and instant
    const title = view.webContents.getTitle()
    const match = title.match(/\((\d+)\)/)
    if (match) {
      return parseInt(match[1], 10)
    }

    // Custom Slack mention scraper
    if (type === 'slack') {
      const result = await view.webContents.executeJavaScript(`
        (() => {
          let count = 0;
          document.querySelectorAll('.c-mention_badge, .p-channel_sidebar__badge, .p-channel_sidebar__close_container .c-mention_badge').forEach(el => {
            const num = parseInt(el.textContent, 10);
            if (!isNaN(num)) {
              count += num;
            }
          });
          const topBadge = document.querySelector('.p-ia__sidebar_header__badge, .p-ia__nav__badge');
          if (topBadge) {
            const num = parseInt(topBadge.textContent, 10);
            if (!isNaN(num)) {
              count = Math.max(count, num);
            }
          }
          return count;
        })()
      `).catch(() => 0)
      return typeof result === 'number' ? result : 0
    }

    // Generic badge class scraper (covers custom or other apps with unread notification badges)
    const genericCount = await view.webContents.executeJavaScript(`
      (() => {
        let count = 0;
        const badges = document.querySelectorAll('[class*="badge"], [class*="unread"], [class*="notification"]');
        badges.forEach(el => {
          const text = el.textContent.trim();
          if (/^\\d+$/.test(text)) {
            const num = parseInt(text, 10);
            if (num > 0 && num < 100) {
              count = Math.max(count, num);
            }
          }
        });
        return count;
      })()
    `).catch(() => 0)
    return typeof genericCount === 'number' ? genericCount : 0

  } catch (error) {
    return 0
  }
}

async function runPeriodicUnreadScrape(): Promise<void> {
  const services = store.get('services') || []
  for (const service of services) {
    if (!service.enabled) continue
    const view = serviceViews.get(service.id)
    if (view) {
      const count = await scrapeUnreadCount(view, service.type)
      handleUnreadCountChange(service.id, count)
    }
  }
}

function getOrCreateView(serviceId: string): WebContentsView | null {
  if (serviceViews.has(serviceId)) {
    return serviceViews.get(serviceId)!
  }

  const services = store.get('services') || []
  const service = services.find((s) => s.id === serviceId)
  if (!service) return null

  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:service-${service.id}`,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // Override User-Agent to avoid browser check rejections
  if (service.type === 'whatsapp' || service.type === 'instagram' || service.type === 'slack') {
    const chromeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    view.webContents.setUserAgent(chromeUA)
  }

  // Handle popups (like Google/Slack OAuth login) in the correct partition
  view.webContents.setWindowOpenHandler((details) => {
    const url = details.url

    // Deny deep links that would launch other local desktop applications
    if (url.startsWith('slack://') || url.startsWith('whatsapp://') || url.startsWith('tg://')) {
      return { action: 'deny' }
    }

    try {
      const parsedUrl = new URL(url)
      const hostname = parsedUrl.hostname

      // Specific Slack workspace redirection handling: load it inside the view itself
      if (service.type === 'slack') {
        const isWorkspaceSubdomain = hostname.endsWith('.slack.com') &&
                                     hostname !== 'www.slack.com' &&
                                     hostname !== 'app.slack.com' &&
                                     hostname !== 'api.slack.com'
        const isSlackOAuth = url.includes('slack.com/oauth') || url.includes('slack.com/openid')

        if (isWorkspaceSubdomain && !isSlackOAuth) {
          view.webContents.loadURL(url).catch((err) => console.error('Failed to load Slack URL in view:', err))
          return { action: 'deny' }
        }
      }

      // General service domain routing: load service's own domains directly in the parent view
      const serviceDomains: Record<string, string[]> = {
        whatsapp: ['whatsapp.com', 'whatsapp.net'],
        telegram: ['telegram.org', 'telegram.me', 't.me'],
        messenger: ['messenger.com', 'facebook.com']
      }

      const domains = serviceDomains[service.type]
      if (domains && domains.some((d) => hostname === d || hostname.endsWith('.' + d))) {
        view.webContents.loadURL(url).catch((err) => console.error('Failed to load service URL in view:', err))
        return { action: 'deny' }
      }
    } catch (e) {
      console.error('Failed to parse window-open URL:', e)
    }

    // Allow OAuth/SSO or service-related domains in the same partition
    const isAuthOrService =
      url.includes('slack.com') ||
      url.includes('accounts.google.com') ||
      url.includes('login.microsoftonline.com') ||
      url.includes('github.com') ||
      url.includes('facebook.com') ||
      url.includes('messenger.com') ||
      url.includes('whatsapp.com') ||
      url.includes('telegram.org') ||
      url.includes('okta.com') ||
      url.includes('appleid.apple.com')

    if (isAuthOrService) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            partition: `persist:service-${service.id}`,
            sandbox: false
          }
        }
      }
    }

    // Open any other external links in the default system browser
    shell.openExternal(url).catch((err) => console.error('Failed to open external URL:', err))
    return { action: 'deny' }
  })

  // Prevent internal navigation to non-web protocol deep links
  view.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http:') && !url.startsWith('https:')) {
      event.preventDefault()
    }
  })

  // Listen to title changes to parse unread counts
  view.webContents.on('page-title-updated', (_event, title) => {
    const match = title.match(/\((\d+)\)/)
    const count = match ? parseInt(match[1], 10) : 0
    handleUnreadCountChange(serviceId, count)
  })

  // Listen to navigation events to save the last visited URL
  view.webContents.on('did-navigate', (_event, url) => {
    saveLastVisitedUrl(serviceId, url)
  })
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    saveLastVisitedUrl(serviceId, url)
  })

  // Apply initial mute state based on DND or per-service settings
  const isMuted = dndActive || !!service.muted
  console.log(`[Main] getOrCreateView: Service ${serviceId} setAudioMuted(${isMuted}). dndActive=${dndActive}, service.muted=${service.muted}`)
  view.webContents.setAudioMuted(isMuted)

  view.webContents.loadURL(service.url)
  serviceViews.set(serviceId, view)
  return view
}

function saveBounds(): void {
  if (!mainWindow) return
  try {
    const isMaximized = mainWindow.isMaximized()
    const bounds = mainWindow.getNormalBounds()
    store.set('window.bounds', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: isMaximized
    })
  } catch (error) {
    console.error('Failed to save window bounds:', error)
  }
}

function queueSaveBounds(): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveBounds, 500)
}

function updateTrayMenu(): void {
  if (!tray || !mainWindow) return

  const isVisible = mainWindow.isVisible()
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Do Not Disturb',
      type: 'checkbox',
      checked: dndActive,
      click: () => {
        try {
          const dndConfig = store.get('dnd') as DndConfig
          dndConfig.manualActive = !dndConfig.manualActive
          store.set('dnd', dndConfig)
          evaluateDndState()
        } catch (error) {
          console.error('Failed to toggle DND from tray:', error)
        }
      }
    },
    { type: 'separator' },
    {
      label: isVisible ? 'Hide Gradd' : 'Show Gradd',
      click: () => {
        if (isVisible) {
          mainWindow?.hide()
        } else {
          mainWindow?.show()
          mainWindow?.focus()
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function createWindow(): void {
  const savedBounds = store.get('window.bounds')

  mainWindow = new BrowserWindow({
    x: savedBounds.x,
    y: savedBounds.y,
    width: savedBounds.width || 1200,
    height: savedBounds.height || 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1f',
      symbolColor: '#e8e8ec',
      height: 32
    },
    transparent: false,
    backgroundColor: '#0f0f11',
    icon: nativeImage.createFromPath(icon),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  // Pipe renderer console messages to main process stdout
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    console.log(`[Renderer ${levels[level] || 'LOG'}] ${message} (at ${sourceId}:${line})`)
  })

  // Restore maximized state if saved
  if (savedBounds.maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) {
      mainWindow?.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load appropriate content depending on environment
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Handle window bounds changes with debounce
  mainWindow.on('resize', queueSaveBounds)
  mainWindow.on('move', queueSaveBounds)
  mainWindow.on('maximize', queueSaveBounds)
  mainWindow.on('unmaximize', queueSaveBounds)

  // Intercept close to minimize to tray based on user preference
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      const general = store.get('general')
      const closeToTray = general ? general.closeToTray : true
      if (closeToTray) {
        e.preventDefault()
        mainWindow?.hide()
      }
      // If closeToTray is false, it closes normally and triggers app.quit() via window-all-closed
    }
  })

  // Dynamic Tray Menu Labels
  mainWindow.on('show', updateTrayMenu)
  mainWindow.on('hide', updateTrayMenu)
}

function createTray(): void {
  const trayImg = nativeImage.createFromPath(icon)
  // Scale down for tray icon display sizing if needed
  tray = new Tray(trayImg.resize({ width: 16, height: 16 }))
  tray.setToolTip('Gradd')

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  updateTrayMenu()
}

app.whenReady().then(() => {
  // Watch window shortcuts (F12, etc.) in dev mode
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC Handlers for persistence
  ipcMain.handle('get-layout-mode', () => {
    return store.get('layout.mode')
  })

  ipcMain.handle('set-layout-mode', (_, mode: 'sidebar' | 'tabs') => {
    store.set('layout.mode', mode)
    pushConfigToCloud()
  })

  ipcMain.handle('get-services', () => {
    return store.get('services') || []
  })

  ipcMain.handle('save-services', (_, services: any[]) => {
    store.set('services', services)
    applyDndState()
    pushConfigToCloud()
  })

  ipcMain.handle('switch-service', (_, id: string | null) => {
    if (activeServiceId === id) return
    if (activeServiceId && mainWindow) {
      const activeView = serviceViews.get(activeServiceId)
      if (activeView) {
        mainWindow.contentView.removeChildView(activeView)
      }
    }
    
    if (id === null) {
      activeServiceId = null
      return
    }

    const view = getOrCreateView(id)
    if (view && mainWindow) {
      mainWindow.contentView.addChildView(view)
      view.setBounds(contentBounds)
      activeServiceId = id
    }
  })

  ipcMain.handle('update-view-bounds', (_, bounds: { x: number, y: number, width: number, height: number }) => {
    contentBounds = bounds
    if (activeServiceId) {
      const activeView = serviceViews.get(activeServiceId)
      if (activeView) {
        activeView.setBounds(contentBounds)
      }
    }
  })

  ipcMain.handle('clear-storage-data', async () => {
    try {
      const services = store.get('services') || []
      for (const service of services) {
        const ses = session.fromPartition(`persist:service-${service.id}`)
        await ses.clearStorageData()
        
        // Reset URL to default
        const defaultService = defaultServices.find((s) => s.id === service.id)
        if (defaultService) {
          service.url = defaultService.url
        }
      }
      store.set('services', services)
      if (mainWindow) {
        mainWindow.webContents.send('services-updated', services)
      }
      await session.defaultSession.clearStorageData()
    } catch (error) {
      console.error('Failed to clear storage data:', error)
    }
  })

  ipcMain.handle('show-service-context-menu', (event, id: string) => {
    const services = store.get('services') || []
    const serviceIndex = services.findIndex((s) => s.id === id)
    const service = services[serviceIndex]
    const isMuted = service ? !!service.muted : false

    const menu = Menu.buildFromTemplate([
      {
        label: 'Refresh',
        click: () => {
          const view = serviceViews.get(id)
          if (view) {
            view.webContents.reload()
          }
        }
      },
      {
        label: isMuted ? 'Unmute' : 'Mute',
        click: () => {
          if (service) {
            service.muted = !isMuted
            services[serviceIndex] = service
            store.set('services', services)
            applyDndState()
            if (mainWindow) {
              mainWindow.webContents.send('services-updated', services)
            }
          }
        }
      }
    ])
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      menu.popup({ window: win })
    }
  })

  ipcMain.handle('clear-service-storage-data', async (_, id: string) => {
    try {
      const ses = session.fromPartition(`persist:service-${id}`)
      await ses.clearStorageData()

      const defaultService = defaultServices.find((s) => s.id === id)
      if (defaultService) {
        const services = store.get('services') || []
        const serviceIndex = services.findIndex((s) => s.id === id)
        if (serviceIndex !== -1) {
          services[serviceIndex].url = defaultService.url
          store.set('services', services)
          if (mainWindow) {
            mainWindow.webContents.send('services-updated', services)
          }
        }
      }

      const view = serviceViews.get(id)
      if (view) {
        if (defaultService) {
          view.webContents.loadURL(defaultService.url).catch(console.error)
        } else {
          view.webContents.reload()
        }
      }
    } catch (error) {
      console.error(`Failed to clear storage data for service ${id}:`, error)
    }
  })

  ipcMain.handle('update-taskbar-badge', (event, dataUrl: string | null, description: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (!dataUrl) {
      win.setOverlayIcon(null, '')
    } else {
      try {
        const img = nativeImage.createFromDataURL(dataUrl)
        win.setOverlayIcon(img, description)
      } catch (error) {
        console.error('Failed to set overlay icon:', error)
      }
    }
  })

  ipcMain.handle('show-native-notification', (_, title: string, body: string) => {
    if (dndActive) return
    try {
      const nativeNotif = new Notification({
        title,
        body,
        silent: false
      })

      nativeNotif.on('click', () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      })

      nativeNotif.show()
    } catch (error) {
      console.error('Failed to trigger native notification:', error)
    }
  })

  ipcMain.handle('get-dnd-config', () => {
    return store.get('dnd')
  })

  ipcMain.handle('set-dnd-config', (_, config: any) => {
    store.set('dnd', config)
    evaluateDndState()
    pushConfigToCloud()
  })

  ipcMain.handle('get-dnd-active', () => {
    return dndActive
  })

  ipcMain.handle('double-click-header', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-general-config', () => {
    return store.get('general') || { closeToTray: true }
  })

  ipcMain.handle('set-general-config', (_, config) => {
    store.set('general', config)
    // Cloud sync syncs the whole config, but for simplicity we only push layout/dnd/services currently.
    // If we want to sync general, we'd add it to pushConfigToCloud. Not strictly required for now.
    return true
  })

  ipcMain.handle('login-google', async () => {
    try {
      const tokens = await loginWithGoogle();
      const { uid, photoURL } = await loginToFirebase(tokens.idToken);
      const encryptedRefresh = encryptToken(tokens.refreshToken);
      
      store.set('auth', { uid, photoURL: photoURL || undefined, refreshToken: encryptedRefresh });
      
      // Fetch cloud config
      const cloudConfig = await fetchConfigFromCloud(uid);
      if (cloudConfig) {
        if (cloudConfig.services) store.set('services', cloudConfig.services);
        if (cloudConfig.dnd) store.set('dnd', cloudConfig.dnd);
        if (cloudConfig.layout) store.set('layout', cloudConfig.layout);
        if (mainWindow) {
          mainWindow.webContents.send('services-updated', store.get('services'));
        }
      } else {
        await pushConfigToCloud();
      }

      setupCloudSyncListener(uid);
      return { success: true, uid };
    } catch (err: any) {
      console.error('Google login failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('logout-google', async () => {
    try {
      await logoutFromFirebase();
      store.delete('auth' as any);
      if (unsubscribeCloudSync) {
        unsubscribeCloudSync();
        unsubscribeCloudSync = null;
      }
      return { success: true };
    } catch (err: any) {
      console.error('Logout failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-auth-status', () => {
    const authState = store.get('auth');
    return authState ? { loggedIn: true, uid: authState.uid, photoURL: authState.photoURL } : { loggedIn: false };
  });

  // --- Auto Updater Setup ---
  autoUpdater.autoDownload = false; // We'll trigger download manually if user chooses
  
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
    // Automatically start download when available
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-not-available', info);
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err.message);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
  });

  ipcMain.handle('check-for-updates', async () => {
    if (!is.dev) {
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        console.error('Failed to check for updates', err);
        mainWindow?.webContents.send('update-error', String(err));
      }
    } else {
      // Mock logic for dev environment
      mainWindow?.webContents.send('update-checking');
      setTimeout(() => {
        mainWindow?.webContents.send('update-not-available', { version: app.getVersion() });
      }, 1500);
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });
  // --------------------------

  // --- Export / Import Setup ---
  ipcMain.handle('export-config', async () => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    const { canceled, filePath } = await require('electron').dialog.showSaveDialog(mainWindow, {
      title: 'Export Gradd Configuration',
      defaultPath: 'gradd-config.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    
    if (canceled || !filePath) return { success: false };
    
    try {
      const fs = require('fs');
      const dataToExport = {
        services: store.get('services'),
        dnd: store.get('dnd'),
        layout: store.get('layout'),
        general: store.get('general')
      };
      fs.writeFileSync(filePath, JSON.stringify(dataToExport, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('Export failed:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('import-config', async () => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    const { canceled, filePaths } = await require('electron').dialog.showOpenDialog(mainWindow, {
      title: 'Import Gradd Configuration',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { success: false };

    try {
      const fs = require('fs');
      const rawData = fs.readFileSync(filePaths[0], 'utf-8');
      const parsedData = JSON.parse(rawData);

      // Apply imported data
      if (parsedData.services) store.set('services', parsedData.services);
      if (parsedData.dnd) store.set('dnd', parsedData.dnd);
      if (parsedData.layout) store.set('layout', parsedData.layout);
      if (parsedData.general) store.set('general', parsedData.general);

      // Force UI refresh and state sync
      mainWindow.webContents.send('services-updated', store.get('services'));
      evaluateDndState();
      pushConfigToCloud();

      // Trigger app restart to cleanly apply layout and service changes
      app.relaunch();
      app.exit(0);

      return { success: true };
    } catch (err) {
      console.error('Import failed:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('clear-config', () => {
    store.clear();
    app.relaunch();
    app.exit(0);
  });
  // -----------------------------

  function setupCloudSyncListener(uid: string) {
    if (unsubscribeCloudSync) unsubscribeCloudSync();
    unsubscribeCloudSync = onCloudConfigChanged(uid, (remoteConfig) => {
      // Basic merge: incoming changes override local
      if (remoteConfig) {
        // Skip updating if identical to avoid loop (simplified)
        if (remoteConfig.services) store.set('services', remoteConfig.services);
        if (remoteConfig.dnd) {
          store.set('dnd', remoteConfig.dnd);
          evaluateDndState();
        }
        if (remoteConfig.layout) store.set('layout', remoteConfig.layout);
        if (mainWindow) mainWindow.webContents.send('services-updated', store.get('services'));
      }
    });
  }

  // Auto-login on startup if token exists
  setTimeout(async () => {
    const auth = store.get('auth');
    if (auth && auth.refreshToken) {
      try {
        const newTokens = await refreshGoogleToken(decryptToken(auth.refreshToken));
        const { uid, photoURL } = await loginToFirebase(newTokens.idToken);
        if (uid === auth.uid) {
          store.set('auth.photoURL', photoURL || undefined);
          setupCloudSyncListener(uid);
          console.log(`[Main] Auto-login restored session for UID: ${uid}`);
        }
      } catch (err) {
        console.error('[Main] Auto-login failed:', err);
      }
    }
  }, 1000);

  // Periodically evaluate DND state (every 30 seconds)
  setInterval(evaluateDndState, 30000)

  // Periodically scrape unread counts for active tabs (every 3 seconds)
  setInterval(runPeriodicUnreadScrape, 3000)

  createWindow()
  createTray()
  
  // Initialize DND state check on startup
  evaluateDndState()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
