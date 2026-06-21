import electron from 'electron'
import type { BrowserWindow as BrowserWindowType, Tray as TrayType, WebContentsView as WebContentsViewType } from 'electron'
const { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, WebContentsView, session, Notification, dialog } = electron
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, writeFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'
import { store, initStore, DndConfig, defaultServices } from './store.js'
import { loginWithGoogle, refreshGoogleToken, encryptToken, decryptToken, getGoogleUserInfo } from './auth.js'
import { loginToFirebase, logoutFromFirebase, syncConfigToCloud, fetchConfigFromCloud, onCloudConfigChanged } from './firebase.js'
import pkg from 'electron-updater'
let isDev = false // set in app.whenReady

let unsubscribeCloudSync: (() => void) | null = null;

// Helper to push current config to cloud (debounced — coalesces rapid config changes)
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

function debouncedPushConfigToCloud() {
  if (cloudSyncTimeout) clearTimeout(cloudSyncTimeout);
  cloudSyncTimeout = setTimeout(() => pushConfigToCloud(), 2000);
}


// Set application name and model ID for proper OS notifications and audio branding
app.setName('Gradd')
app.setAppUserModelId('com.gradd.app')

// Prevent multiple instances — if a second instance launches, focus the existing window.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// Disable Chrome's autoplay user gesture requirement to allow web page notification sounds
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindowType | null = null
let tray: TrayType | null = null
let isQuitting = false
let saveTimeout: NodeJS.Timeout | null = null
let cloudSyncTimeout: NodeJS.Timeout | null = null

const serviceViews = new Map<string, WebContentsViewType>()
// Tracks the last URL the user navigated to within each service (in-memory only, not persisted).
const lastVisitedUrls = new Map<string, string>()
// Tracks when each service was last viewed (ms). Used to throttle inactive renderers.
const serviceLastActive = new Map<string, number>()
const serviceUnreads = new Map<string, number>()
// Counts how many consecutive scrape cycles returned 0 for each service.
// A count is only cleared to 0 after 2 consecutive zeros — prevents a single
// transient DOM state (e.g. Messenger React re-render) from flashing the badge off.
const serviceZeroStreak = new Map<string, number>()
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
    const service = services.find((s) => s.id === serviceId)
    if (!service) return

    const parsed = new URL(url)
    const hostname = parsed.hostname
    const allowedDomains = getServiceDomains(service.type)

    const isAllowed = allowedDomains.some((d) => hostname === d || hostname.endsWith('.' + d))
    if (!isAllowed) return

    lastVisitedUrls.set(serviceId, url)
  } catch (error) {
    console.error(`Failed to save last visited URL for service ${serviceId}:`, error)
  }
}

function handleUnreadCountChange(serviceId: string, count: number): void {
  // If the window is focused and this is the active tab, the user can already see
  // the conversation — don't flash a badge for messages they're actively reading.
  if (count > 0 && serviceId === activeServiceId && mainWindow?.isFocused()) {
    count = 0
  }

  const currentCount = serviceUnreads.get(serviceId) || 0

  if (count > 0) {
    // Positive count: reset zero streak and apply immediately
    serviceZeroStreak.set(serviceId, 0)
  } else {
    // Zero: require 2 consecutive zeros before clearing a live badge.
    // This absorbs single-cycle DOM misses (e.g. Messenger React re-renders,
    // Telegram loading states) without introducing noticeable delay.
    const streak = (serviceZeroStreak.get(serviceId) || 0) + 1
    serviceZeroStreak.set(serviceId, streak)
    if (streak < 2 && currentCount > 0) return
  }

  if (currentCount === count) return

  serviceUnreads.set(serviceId, count)

  if (mainWindow) {
    mainWindow.webContents.send('unread-counts-updated', { serviceId, count })
  }
}

async function scrapeUnreadCount(view: WebContentsViewType, type: string, currentCount = 0): Promise<number> {
  try {
    if (view.webContents.isDestroyed()) return 0

    // Title-based detection — fast path for new/changed counts only.
    // When the title count differs from what we already have, use it immediately
    // (e.g. a new message just arrived). When it matches our current count, fall
    // through to the DOM scraper — the title may be stale (apps like Telegram don't
    // always clear "(N)" from their title when the user reads messages inside Gradd).
    const title = view.webContents.getTitle()
    const titleMatch = title.match(/\((\d+)\)/)
    if (titleMatch) {
      const titleCount = parseInt(titleMatch[1], 10)
      if (titleCount !== currentCount) return titleCount
      // titleCount === currentCount: fall through so DOM can report 0 if messages were read
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

    // Telegram Web: sum only COLORED (non-muted, non-archived) unread badges.
    //
    // Why color-based detection instead of class-based:
    // Telegram Web A applies gray to muted/archived badges via a parent CSS rule
    // (.chatlist-chat.is-muted .badge { color: gray }), so the badge element itself
    // only carries the class "badge" — :not(.badge-muted) does NOT exclude them.
    // The visual distinction (colored = real unread, gray = muted/archived) is a
    // stable Telegram design contract we can rely on.
    if (type === 'telegram') {
      const result = await view.webContents.executeJavaScript(`
        (() => {
          let total = 0;
          const root = document.querySelector('.chatlist, .chats-container') || document;
          root.querySelectorAll('.badge').forEach(el => {
            // Skip class-marked muted badges (older Telegram versions do set this)
            if (el.classList.contains('badge-muted')) return;
            // Skip gray badges: muted/archived badges are unsaturated (max channel
            // minus min channel < 30). Real unread badges are teal/green/blue (> 50).
            try {
              const rgb = getComputedStyle(el).backgroundColor.match(/\\d+/g);
              if (rgb && rgb.length >= 3) {
                const r = +rgb[0], g = +rgb[1], b = +rgb[2];
                if (Math.max(r,g,b) - Math.min(r,g,b) < 30) return;
              }
            } catch (_) {}
            const text = el.textContent.trim();
            if (/^\\d+$/.test(text)) {
              const num = parseInt(text, 10);
              if (num > 0 && num <= 9999) total += num;
            }
          });
          return total;
        })()
      `).catch(() => 0)
      return typeof result === 'number' ? result : 0
    }

    // Messenger: "(N) Messenger" title is the primary signal (handled at the top of this
    // function). When the WebContentsView gains focus Messenger strips the count from the
    // title, so the periodic scraper sees "Messenger" and would return 0. The fallback
    // below keeps the badge alive by inspecting the DOM directly.
    //
    // Detection order:
    //  1. aria-label with explicit count ("2 unread", "2 new messages")
    //  2. data-testid attributes Meta uses internally
    //  3. rows/items whose aria-label mentions "unread" or "new"
    //  4. Color-based: Meta blue (~rgb(0,132,255)) small circle = unread dot per thread
    if (type === 'messenger') {
      const result = await view.webContents.executeJavaScript(`
        (() => {
          // S1: aria-label with explicit numeric count
          let total = 0;
          document.querySelectorAll('[aria-label]').forEach(el => {
            const label = el.getAttribute('aria-label') || '';
            const m = label.match(/(\\d+)\\s+(?:unread|new\\s+message)/i);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > 0 && n <= 9999) total += n;
            }
          });
          if (total > 0) return total;

          // S2: data-testid attributes Meta uses for unread indicators
          const testidEls = document.querySelectorAll(
            '[data-testid*="unread" i], [data-testid*="new-message" i], [data-testid*="unseen" i]'
          );
          if (testidEls.length > 0) return testidEls.length;

          // S3: rows or items (and their children) whose aria-label mentions "unread"/"new"
          const seen = new Set();
          [
            '[role="row"][aria-label*="unread" i]',
            '[role="listitem"][aria-label*="unread" i]',
            '[role="row"][aria-label*="new" i]',
            '[role="row"] [aria-label*="unread" i]',
            '[role="listitem"] [aria-label*="unread" i]',
          ].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
              seen.add(el.closest('[role="row"],[role="listitem"]') || el);
            });
          });
          if (seen.size > 0) return seen.size;

          // S4: color-based — Meta's blue unread dot (~rgb(0,132,255)), small circle,
          // one per unread thread in the conversation list.
          // Cap total element checks at 80 to avoid perf impact on large chat lists.
          const list =
            document.querySelector('[role="grid"]') ||
            document.querySelector('[role="list"]') ||
            document.querySelector('ul');
          if (!list) return 0;
          let dotCount = 0, checked = 0;
          const rows = list.querySelectorAll('[role="row"],[role="listitem"],li');
          outer: for (const row of rows) {
            for (const el of row.querySelectorAll('span,div,i')) {
              if (checked++ >= 80) break outer;
              try {
                const rect = el.getBoundingClientRect();
                if (rect.width < 6 || rect.width > 20 || Math.abs(rect.width - rect.height) > 4) continue;
                const rgb = getComputedStyle(el).backgroundColor.match(/\\d+/g);
                if (!rgb || rgb.length < 3) continue;
                if (+rgb[0] < 30 && +rgb[1] > 80 && +rgb[1] < 200 && +rgb[2] > 200) {
                  dotCount++;
                  break;
                }
              } catch (_) {}
            }
          }
          return dotCount;
        })()
      `).catch(() => 0)
      return typeof result === 'number' ? result : 0
    }

    // Instagram: "(N) Instagram" title is the primary signal. After the app idles the
    // WebContentsView may still be "focused" from Instagram's perspective, causing the
    // title to revert to plain "Instagram". Same four-strategy fallback as Messenger.
    if (type === 'instagram') {
      const result = await view.webContents.executeJavaScript(`
        (() => {
          // S1: aria-label with explicit count
          let total = 0;
          document.querySelectorAll('[aria-label]').forEach(el => {
            const label = el.getAttribute('aria-label') || '';
            const m = label.match(/(\\d+)\\s+(?:unread|new\\s+message)/i);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > 0 && n <= 9999) total = Math.max(total, n);
            }
          });
          if (total > 0) return total;

          // S2: data-testid
          const testidEls = document.querySelectorAll(
            '[data-testid*="unread" i], [data-testid*="new-message" i], [data-testid*="unseen" i]'
          );
          if (testidEls.length > 0) return testidEls.length;

          // S3: a/li/listitem/link elements with "unread" in aria-label
          let threadCount = 0;
          document.querySelectorAll('[aria-label*="unread" i]').forEach(el => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || '';
            if (tag === 'a' || tag === 'li' || role === 'listitem' || role === 'link') {
              threadCount++;
            }
          });
          if (threadCount > 0) return threadCount;

          // S4: same Meta blue dot detection, capped at 80 element checks
          const list =
            document.querySelector('[role="grid"]') ||
            document.querySelector('[role="list"]') ||
            document.querySelector('ul');
          if (!list) return 0;
          let dotCount = 0, checked = 0;
          const rows = list.querySelectorAll('[role="row"],[role="listitem"],li');
          outer: for (const row of rows) {
            for (const el of row.querySelectorAll('span,div,i')) {
              if (checked++ >= 80) break outer;
              try {
                const rect = el.getBoundingClientRect();
                if (rect.width < 6 || rect.width > 20 || Math.abs(rect.width - rect.height) > 4) continue;
                const rgb = getComputedStyle(el).backgroundColor.match(/\\d+/g);
                if (!rgb || rgb.length < 3) continue;
                if (+rgb[0] < 30 && +rgb[1] > 80 && +rgb[1] < 200 && +rgb[2] > 200) {
                  dotCount++;
                  break;
                }
              } catch (_) {}
            }
          }
          return dotCount;
        })()
      `).catch(() => 0)
      return typeof result === 'number' ? result : 0
    }

    // WhatsApp Web: CSS classnames are obfuscated. Use aria-label and Meta blue dot detection
    // (same DOM family as Messenger/Instagram — also a Meta product).
    if (type === 'whatsapp') {
      const result = await view.webContents.executeJavaScript(`
        (() => {
          // S1: aria-label with explicit numeric count
          let total = 0;
          document.querySelectorAll('[aria-label]').forEach(el => {
            const label = el.getAttribute('aria-label') || '';
            const m = label.match(/(\\d+)\\s+(?:unread|new\\s+message)/i);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > 0 && n <= 9999) total += n;
            }
          });
          if (total > 0) return total;

          // S2: data-testid attributes WhatsApp uses for unread indicators
          const testidEls = document.querySelectorAll(
            '[data-testid*="unread" i], [data-testid*="new-message" i], [data-testid*="unseen" i]'
          );
          if (testidEls.length > 0) return testidEls.length;

          // S3: rows whose aria-label or child aria-label mentions "unread"
          const seen = new Set();
          [
            '[data-testid="cell-frame-container"][aria-label*="unread" i]',
            '[role="row"][aria-label*="unread" i]',
            '[role="listitem"][aria-label*="unread" i]',
            '[data-testid="cell-frame-container"] [aria-label*="unread message" i]',
          ].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
              seen.add(el.closest('[data-testid="cell-frame-container"],[role="row"],[role="listitem"]') || el);
            });
          });
          if (seen.size > 0) return seen.size;

          // S4: Meta blue dot (~rgb(0,132,255)) in chat list rows, one dot per unread thread.
          // Cap element checks at 80 to avoid perf impact on large chat lists.
          const list =
            document.querySelector('[data-testid="chat-list"]') ||
            document.querySelector('[role="grid"]') ||
            document.querySelector('[role="list"]');
          if (!list) return 0;
          let dotCount = 0, checked = 0;
          const rows = list.querySelectorAll('[role="row"],[role="listitem"],[data-testid="cell-frame-container"]');
          outer: for (const row of rows) {
            for (const el of row.querySelectorAll('span,div,i')) {
              if (checked++ >= 80) break outer;
              try {
                const rect = el.getBoundingClientRect();
                if (rect.width < 6 || rect.width > 20 || Math.abs(rect.width - rect.height) > 4) continue;
                const rgb = getComputedStyle(el).backgroundColor.match(/\\d+/g);
                if (!rgb || rgb.length < 3) continue;
                if (+rgb[0] < 30 && +rgb[1] > 80 && +rgb[1] < 200 && +rgb[2] > 200) {
                  dotCount++;
                  break;
                }
              } catch (_) {}
            }
          }
          return dotCount;
        })()
      `).catch(() => 0)
      return typeof result === 'number' ? result : 0
    }

    // Gadu-Gadu (gg.pl): standard web app, not obfuscated. Try aria-label, class
    // patterns, and data attributes. Title "(N) GG" format may not exist — DOM scraper is
    // the primary source.
    if (type === 'gadugadu') {
      const result = await view.webContents.executeJavaScript(`
        (() => {
          // S1: aria-label with numeric count (English and Polish variants)
          let best = 0;
          document.querySelectorAll('[aria-label]').forEach(el => {
            const label = el.getAttribute('aria-label') || '';
            const m = label.match(/(\\d+)\\s+(?:unread|new|nieprzeczytanych|nowych)/i);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > 0 && n <= 9999) best = Math.max(best, n);
            }
          });
          if (best > 0) return best;

          // S2: class-based with numeric text content
          document.querySelectorAll('[class*="unread"], [class*="badge"], [class*="count"], [class*="notification"]').forEach(el => {
            const text = el.textContent.trim();
            if (/^\\d+$/.test(text)) {
              const n = parseInt(text, 10);
              if (n > 0 && n <= 9999) best = Math.max(best, n);
            }
          });
          if (best > 0) return best;

          // S3: data attributes with numeric values
          document.querySelectorAll('[data-count], [data-unread-count], [data-badge], [data-unread]').forEach(el => {
            const val = el.getAttribute('data-count') || el.getAttribute('data-unread-count') ||
                        el.getAttribute('data-badge') || el.getAttribute('data-unread') || '';
            const n = parseInt(val, 10);
            if (n > 0 && n <= 9999) best = Math.max(best, n);
          });
          if (best > 0) return best;

          // S4: title without parens — catches "3 | Gadu-Gadu" or "3 - Messenger" formats
          const titleNum = document.title.match(/^(\\d+)[^)]/);
          if (titleNum) return parseInt(titleNum[1], 10);

          return 0;
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
  // Skip scraping when the app window is minimised or hidden — saves CPU + IPC round-trips
  if (!mainWindow || !mainWindow.isVisible()) return

  const services = store.get('services') || []
  const tasks: Promise<void>[] = []

  for (const service of services) {
    if (!service.enabled) continue
    const view = serviceViews.get(service.id)
    if (!view) continue

    tasks.push(
      scrapeUnreadCount(view, service.type, serviceUnreads.get(service.id) || 0).then((count) => {
        handleUnreadCountChange(service.id, count)
      })
    )
  }

  // Run all scrapes in parallel; ignore individual failures
  await Promise.allSettled(tasks)
}

function getOrCreateView(serviceId: string): WebContentsViewType | null {
  if (serviceViews.has(serviceId)) {
    return serviceViews.get(serviceId)!
  }

  const services = store.get('services') || []
  const service = services.find((s) => s.id === serviceId)
  if (!service) return null

  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:service-${service.id}`,
      preload: join(__dirname, '../preload/service-bridge.mjs'),
      sandbox: true,
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

  // Listen to title changes to parse unread counts.
  // hadTitleCount tracks whether the previous title carried a "(N)" prefix.
  // When the title transitions from having a count to NOT having one, that's
  // the service itself signalling "messages read" — trigger an immediate DOM
  // scrape rather than waiting for the next periodic cycle (~8 s).
  let hadTitleCount = false
  view.webContents.on('page-title-updated', (_event, title) => {
    const match = title.match(/\((\d+)\)/)
    if (match) {
      hadTitleCount = true
      handleUnreadCountChange(serviceId, parseInt(match[1], 10))
    } else if (hadTitleCount) {
      // Title just lost its count — messages likely read. Scrape after a short
      // delay so the DOM has time to settle (React re-renders, Messenger transitions).
      hadTitleCount = false
      setTimeout(() => {
        const current = serviceUnreads.get(serviceId) || 0
        if (current === 0) return
        scrapeUnreadCount(view, service.type, current).then((count) => {
          if (count === 0) {
            // DOM confirms zero — force-clear without waiting for the 2-streak
            serviceZeroStreak.set(serviceId, 2)
            handleUnreadCountChange(serviceId, 0)
          }
        }).catch(() => {})
      }, 600)
    }
  })

  // Listen to navigation events to save the last visited URL
  view.webContents.on('did-navigate', (_event, url) => {
    saveLastVisitedUrl(serviceId, url)
  })
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    saveLastVisitedUrl(serviceId, url)
  })

  // Telegram: fix scroll-up after sending a message.
  // When the input field clears and shrinks on send, the layout reflows and the scroll
  // position drifts upward. A MutationObserver re-anchors to the bottom whenever a new
  // message node is added and the user was already near the bottom.
  if (service.type === 'telegram') {
    view.webContents.on('did-finish-load', () => {
      view.webContents.executeJavaScript(`
        (function() {
          if (window.__graddScrollFix) return;
          window.__graddScrollFix = true;
          history.scrollRestoration = 'manual';

          function init() {
            const container =
              document.querySelector('.bubbles') ||
              document.querySelector('.messages-container');
            if (!container) { setTimeout(init, 2000); return; }

            const observer = new MutationObserver(() => {
              const gap = container.scrollHeight - container.scrollTop - container.clientHeight;
              if (gap < 200) {
                requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
              }
            });
            observer.observe(container, { childList: true, subtree: true });
          }

          setTimeout(init, 1500);
        })();
      `).catch(() => {});
    });
  }

  // Send loading state to renderer when page loading starts/stops
  view.webContents.on('did-start-loading', () => {
    if (mainWindow) {
      mainWindow.webContents.send('service-loading', { serviceId, loading: true })
    }
  })
  view.webContents.on('did-stop-loading', () => {
    if (mainWindow) {
      mainWindow.webContents.send('service-loading', { serviceId, loading: false })
    }
  })

  // Apply initial mute state based on DND or per-service settings
  const isMuted = dndActive || !!service.muted
  console.log(`[Main] getOrCreateView: Service ${serviceId} setAudioMuted(${isMuted}). dndActive=${dndActive}, service.muted=${service.muted}`)
  view.webContents.setAudioMuted(isMuted)

  const homeUrl = defaultServices.find((s) => s.id === serviceId)?.url ?? service.url
  view.webContents.loadURL(homeUrl).catch(console.error)
  serviceViews.set(serviceId, view)
  serviceLastActive.set(serviceId, Date.now())
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

  // Pipe renderer console messages to main process stdout (new single-object event API)
  mainWindow.webContents.on('console-message', (event) => {
    const { level, message, line, sourceId } = event as any
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    console.log(`[Renderer ${levels[level] || 'LOG'}] ${message} (at ${sourceId}:${line})`)
  })

  // Restore maximized state if saved
  if (savedBounds.maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) {
      mainWindow?.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load appropriate content depending on environment
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
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

const ALLOWED_SERVICE_TYPES = ['messenger', 'whatsapp', 'telegram', 'slack', 'instagram', 'gadugadu']

function validateImportedConfig(data: unknown): { valid: boolean; reason?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Root value must be an object.' }
  }
  const obj = data as Record<string, unknown>

  if (obj.services !== undefined) {
    if (!Array.isArray(obj.services)) return { valid: false, reason: '"services" must be an array.' }
    for (const svc of obj.services) {
      if (!svc || typeof svc !== 'object') return { valid: false, reason: 'Each service must be an object.' }
      const s = svc as Record<string, unknown>
      if (typeof s.id !== 'string' || !s.id) return { valid: false, reason: 'Service "id" must be a non-empty string.' }
      if (typeof s.name !== 'string' || !s.name) return { valid: false, reason: 'Service "name" must be a non-empty string.' }
      if (typeof s.enabled !== 'boolean') return { valid: false, reason: 'Service "enabled" must be a boolean.' }
      if (!ALLOWED_SERVICE_TYPES.includes(s.type as string)) {
        return { valid: false, reason: `Service type "${s.type}" is not recognised.` }
      }
      if (typeof s.url !== 'string') return { valid: false, reason: 'Service "url" must be a string.' }
      try {
        const parsed = new URL(s.url as string)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { valid: false, reason: `Service URL "${s.url}" must use http or https.` }
        }
      } catch {
        return { valid: false, reason: `Service URL "${s.url}" is not a valid URL.` }
      }
    }
  }

  if (obj.dnd !== undefined) {
    if (typeof obj.dnd !== 'object' || Array.isArray(obj.dnd)) return { valid: false, reason: '"dnd" must be an object.' }
    const dnd = obj.dnd as Record<string, unknown>
    if (typeof dnd.manualActive !== 'boolean') return { valid: false, reason: '"dnd.manualActive" must be a boolean.' }
    if (typeof dnd.scheduleEnabled !== 'boolean') return { valid: false, reason: '"dnd.scheduleEnabled" must be a boolean.' }
    if (typeof dnd.startTime !== 'string' || !/^\d{2}:\d{2}$/.test(dnd.startTime as string)) {
      return { valid: false, reason: '"dnd.startTime" must be HH:MM format.' }
    }
    if (typeof dnd.endTime !== 'string' || !/^\d{2}:\d{2}$/.test(dnd.endTime as string)) {
      return { valid: false, reason: '"dnd.endTime" must be HH:MM format.' }
    }
  }

  if (obj.layout !== undefined) {
    if (typeof obj.layout !== 'object' || Array.isArray(obj.layout)) return { valid: false, reason: '"layout" must be an object.' }
    const layout = obj.layout as Record<string, unknown>
    if (layout.mode !== undefined && layout.mode !== 'sidebar' && layout.mode !== 'tabs') {
      return { valid: false, reason: '"layout.mode" must be "sidebar" or "tabs".' }
    }
  }

  if (obj.general !== undefined) {
    if (typeof obj.general !== 'object' || Array.isArray(obj.general)) return { valid: false, reason: '"general" must be an object.' }
    const general = obj.general as Record<string, unknown>
    if (general.closeToTray !== undefined && typeof general.closeToTray !== 'boolean') {
      return { valid: false, reason: '"general.closeToTray" must be a boolean.' }
    }
    if (general.showTabLabels !== undefined && typeof general.showTabLabels !== 'boolean') {
      return { valid: false, reason: '"general.showTabLabels" must be a boolean.' }
    }
  }

  return { valid: true }
}

// Block Ctrl+R / Ctrl+Shift+R / F5 across every webContents (main window + all service views)
app.on('web-contents-created', (_, contents) => {
  contents.on('before-input-event', (event, input) => {
    if ((input.control && (input.key === 'r' || input.key === 'R')) || input.key === 'F5') {
      event.preventDefault()
    }
  })
})

app.whenReady().then(() => {
  isDev = !app.isPackaged
  initStore(app.getPath('userData'))
  const { autoUpdater } = pkg

  // Open/close DevTools with F12 in dev mode
  if (isDev) {
    app.on('browser-window-created', (_, window) => {
      window.webContents.on('before-input-event', (_, input) => {
        if (input.key === 'F12') window.webContents.toggleDevTools()
      })
    })
  }

  // Register IPC Handlers for persistence
  ipcMain.handle('get-layout-mode', () => {
    return store.get('layout.mode')
  })

  ipcMain.handle('set-layout-mode', (_, mode: 'sidebar' | 'tabs') => {
    store.set('layout.mode', mode)
    debouncedPushConfigToCloud()
  })

  ipcMain.handle('get-services', () => {
    return store.get('services') || []
  })

  ipcMain.handle('save-services', (_, services: any[]) => {
    const previousServices = store.get('services') || []
    store.set('services', services)
    applyDndState()
    debouncedPushConfigToCloud()

    // Destroy WebContentsViews for services that have been disabled to free Chromium memory
    for (const prev of previousServices) {
      const current = services.find((s) => s.id === prev.id)
      if (prev.enabled && current && !current.enabled) {
        const view = serviceViews.get(prev.id)
        if (view) {
          try {
            if (mainWindow && !view.webContents.isDestroyed()) {
              mainWindow.contentView.removeChildView(view)
            }
            ;(view.webContents as any).destroy()
          } catch (_) { /* ignore */ }
          serviceViews.delete(prev.id)
          serviceUnreads.delete(prev.id)
          serviceZeroStreak.delete(prev.id)
        }
      }
    }
  })

  ipcMain.handle('switch-service', (_, id: string | null) => {
    if (activeServiceId === id) return

    if (activeServiceId && mainWindow) {
      const activeView = serviceViews.get(activeServiceId)
      if (activeView) {
        mainWindow.contentView.removeChildView(activeView)
        // Put the outgoing service into throttled mode — WebSocket stays alive for
        // notifications, but Chromium can aggressively GC its V8 heap.
        activeView.webContents.setBackgroundThrottling(true)
      }
    }

    if (id === null) {
      activeServiceId = null
      return
    }

    const view = getOrCreateView(id)
    if (view && mainWindow) {
      // Restore full performance for the service the user is actively viewing
      view.webContents.setBackgroundThrottling(false)
      mainWindow.contentView.addChildView(view)
      view.setBounds(contentBounds)
      activeServiceId = id
      serviceLastActive.set(id, Date.now())
      // Push current loading state immediately — did-start-loading fires at view
      // creation time (before the renderer listener is ready), so the renderer
      // would otherwise never know the view was loading when the tab is first clicked.
      const loading = !view.webContents.isDestroyed() && view.webContents.isLoading()
      mainWindow.webContents.send('service-loading', { serviceId: id, loading })
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

  ipcMain.handle('show-profile-menu', (event) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Settings',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('profile-menu-action', 'settings')
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Log Out',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('profile-menu-action', 'logout')
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

  // Fired by service-bridge.ts preload whenever a service fires window.Notification.
  // (a) Show a native OS toast respecting DND.
  // (b) Immediately rescrape that service so the badge updates without waiting for the
  //     8-second polling cycle. Title-based detection means no DOM touching for services
  //     like Telegram that already put the count in document.title.
  ipcMain.on('service-notification', (event, { title, body }: { title: string; body: string }) => {
    // Show native toast
    if (!dndActive) {
      try {
        const notif = new Notification({ title, body, silent: false })
        notif.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
        notif.show()
      } catch {}
    }
    // Identify the sending service and rescrape immediately
    for (const [serviceId, view] of serviceViews) {
      if (view.webContents.id === event.sender.id) {
        const services = store.get('services') || []
        const service = services.find((s) => s.id === serviceId)
        if (service) {
          scrapeUnreadCount(view, service.type, serviceUnreads.get(serviceId) || 0).then((count) => {
            handleUnreadCountChange(serviceId, count)
          }).catch(() => {})
        }
        break
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
    debouncedPushConfigToCloud()
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

  ipcMain.handle('open-external', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('get-general-config', () => {
    const saved = (store.get('general') || {}) as Record<string, unknown>
    return {
      closeToTray: saved.closeToTray !== false,
      showTabLabels: saved.showTabLabels !== false,
      showLoadingBar: saved.showLoadingBar !== false
    }
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

      // Always get user info from Google — this is the source of truth for uid/photoURL
      // and works regardless of Firebase client_id configuration.
      const userInfo = await getGoogleUserInfo(tokens.accessToken);
      const encryptedRefresh = encryptToken(tokens.refreshToken);

      let uid = userInfo.uid;
      let photoURL: string | undefined = userInfo.photoURL || undefined;

      // Attempt Firebase auth for cloud sync — optional, degrades gracefully.
      // Fails when the Desktop app OAuth client_id isn't in Firebase's authorized list;
      // user is still logged in locally and cloud sync is skipped.
      let firebaseOk = false;
      try {
        const firebaseResult = await loginToFirebase(tokens.idToken);
        uid = firebaseResult.uid; // Firebase uid matches Google sub
        photoURL = firebaseResult.photoURL || photoURL;
        firebaseOk = true;
      } catch (fbErr: any) {
        console.warn('[Auth] Firebase login failed — cloud sync unavailable:', fbErr.message);
      }

      store.set('auth', { uid, photoURL, refreshToken: encryptedRefresh });

      if (firebaseOk) {
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
      }

      return { success: true, uid, photoURL };
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

    // Notify the user via a native OS toast — works even if Settings panel isn't open
    try {
      const notif = new Notification({
        title: 'Gradd update ready',
        body: `Version ${info.version} downloaded. Click to install and restart.`,
        silent: false
      })
      notif.on('click', () => autoUpdater.quitAndInstall())
      notif.show()
    } catch (e) {
      console.error('[Updater] Failed to show update notification:', e)
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    if (!isDev) {
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
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Gradd Configuration',
      defaultPath: 'gradd-config.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return { success: false };

    try {
      const dataToExport = {
        services: store.get('services'),
        dnd: store.get('dnd'),
        layout: store.get('layout'),
        general: store.get('general')
      };
      writeFileSync(filePath, JSON.stringify(dataToExport, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('Export failed:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('import-config', async () => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Gradd Configuration',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { success: false };

    try {
      const rawData = readFileSync(filePaths[0], 'utf-8');
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        return { success: false, error: 'File is not valid JSON.' };
      }

      // Reject anything that doesn't match the expected config shape.
      // Without this check, a crafted file could inject arbitrary service URLs
      // that would be silently loaded in WebContentsViews after relaunch.
      const validation = validateImportedConfig(parsedData);
      if (!validation.valid) {
        console.error('Import rejected — schema validation failed:', validation.reason);
        return { success: false, error: `Invalid configuration file: ${validation.reason}` };
      }

      const data = parsedData as Record<string, unknown>;
      if (data.services) store.set('services', data.services);
      if (data.dnd) store.set('dnd', data.dnd);
      if (data.layout) store.set('layout', data.layout);
      if (data.general) store.set('general', data.general);

      mainWindow.webContents.send('services-updated', store.get('services'));
      evaluateDndState();
      pushConfigToCloud();

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

  // Auto-login on startup if a stored refresh token exists
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
      } catch (err: any) {
        console.error('[Main] Auto-login failed:', err);
        // Token is stale or the OAuth client changed (e.g. client_secret removed).
        // Clear it so the error doesn't repeat on every startup — user re-logs in Settings.
        const msg: string = err?.message ?? '';
        if (
          msg.includes('client_secret') ||
          msg.includes('invalid_client') ||
          msg.includes('invalid_grant') ||
          msg.includes('Token has been expired')
        ) {
          store.delete('auth' as any);
          console.warn('[Main] Cleared stale auth token — please sign in again via Settings.');
          if (mainWindow) mainWindow.webContents.send('services-updated', store.get('services'));
        }
      }
    }
  }, 1000);

  // Periodically evaluate DND state (every 30 seconds)
  setInterval(evaluateDndState, 30000)

  // Periodically scrape unread counts for background tabs (active tab uses title-update events)
  setInterval(runPeriodicUnreadScrape, 8000)

  createWindow()
  createTray()

  // Initialize DND state check on startup
  evaluateDndState()

  // Silently check for updates 30 seconds after launch (production only)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[Updater] Background check failed:', err)
      })
    }, 30000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  // Destroy all WebContentsViews to release Chromium renderer processes
  for (const [, view] of serviceViews) {
    try {
      if (!view.webContents.isDestroyed()) {
        // destroy() exists at runtime but is absent from Electron's bundled type stubs
        ;(view.webContents as any).destroy()
      }
    } catch (_) {
      // Ignore errors during shutdown
    }
  }
  serviceViews.clear()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
