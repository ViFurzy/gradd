import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  DndConfig,
  GeneralConfig,
  GeneralConfigView,
  ServiceConfig,
  UpdateInfo
} from '../shared/types'

// Custom APIs for renderer
const api = {
  getLayoutMode: (): Promise<'sidebar' | 'tabs'> => ipcRenderer.invoke('get-layout-mode'),
  setLayoutMode: (mode: 'sidebar' | 'tabs'): Promise<void> =>
    ipcRenderer.invoke('set-layout-mode', mode),
  getServices: (): Promise<ServiceConfig[]> => ipcRenderer.invoke('get-services'),
  saveServices: (services: ServiceConfig[]): Promise<void> =>
    ipcRenderer.invoke('save-services', services),
  switchService: (id: string | null): Promise<void> => ipcRenderer.invoke('switch-service', id),
  updateViewBounds: (bounds: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<void> => ipcRenderer.invoke('update-view-bounds', bounds),
  clearStorageData: (): Promise<void> => ipcRenderer.invoke('clear-storage-data'),
  showServiceContextMenu: (id: string): Promise<void> =>
    ipcRenderer.invoke('show-service-context-menu', id),
  clearServiceStorageData: (id: string): Promise<void> =>
    ipcRenderer.invoke('clear-service-storage-data', id),
  onUnreadCountsUpdated: (
    callback: (data: { serviceId: string; count: number }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { serviceId: string; count: number }): void =>
      callback(data)
    ipcRenderer.on('unread-counts-updated', handler)
    return () => {
      ipcRenderer.removeListener('unread-counts-updated', handler)
    }
  },
  updateTaskbarBadge: (dataUrl: string | null, description: string): Promise<void> =>
    ipcRenderer.invoke('update-taskbar-badge', dataUrl, description),
  showNativeNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-native-notification', title, body),
  getDndConfig: (): Promise<DndConfig> => ipcRenderer.invoke('get-dnd-config'),
  setDndConfig: (config: DndConfig): Promise<void> => ipcRenderer.invoke('set-dnd-config', config),
  getDndActive: (): Promise<boolean> => ipcRenderer.invoke('get-dnd-active'),
  doubleClickHeader: (): Promise<void> => ipcRenderer.invoke('double-click-header'),
  onDndStatusChanged: (callback: (active: boolean) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, active: boolean): void => callback(active)
    ipcRenderer.on('dnd-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('dnd-status-changed', handler)
    }
  },
  onServicesUpdated: (callback: (services: ServiceConfig[]) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, services: ServiceConfig[]): void =>
      callback(services)
    ipcRenderer.on('services-updated', handler)
    return () => {
      ipcRenderer.removeListener('services-updated', handler)
    }
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  getActiveUserStats: (): Promise<{ dau: number; mau: number } | null> =>
    ipcRenderer.invoke('get-active-user-stats'),
  getGeneralConfig: (): Promise<GeneralConfigView> => ipcRenderer.invoke('get-general-config'),
  setGeneralConfig: (config: GeneralConfig): Promise<void> =>
    ipcRenderer.invoke('set-general-config', config),
  exportConfig: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export-config'),
  importConfig: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('import-config'),
  clearConfig: (): Promise<void> => ipcRenderer.invoke('clear-config'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  onUpdateChecking: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('update-checking', handler)
    return () => {
      ipcRenderer.removeListener('update-checking', handler)
    }
  },
  onUpdateAvailable: (callback: (info: UpdateInfo) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, info: UpdateInfo): void => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => {
      ipcRenderer.removeListener('update-available', handler)
    }
  },
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, info: UpdateInfo): void => callback(info)
    ipcRenderer.on('update-not-available', handler)
    return () => {
      ipcRenderer.removeListener('update-not-available', handler)
    }
  },
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, info: UpdateInfo): void => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => {
      ipcRenderer.removeListener('update-downloaded', handler)
    }
  },
  onUpdateError: (callback: (error: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, err: string): void => callback(err)
    ipcRenderer.on('update-error', handler)
    return () => {
      ipcRenderer.removeListener('update-error', handler)
    }
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  setAppPin: (pin: string, currentPin?: string): Promise<boolean> =>
    ipcRenderer.invoke('set-app-pin', pin, currentPin),
  verifyAppPin: (pin: string): Promise<{ ok: boolean; retryAfterMs?: number }> =>
    ipcRenderer.invoke('verify-app-pin', pin),
  onLockApp: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('lock-app', handler)
    return () => {
      ipcRenderer.removeListener('lock-app', handler)
    }
  }
}

// Intercept HTML5 Notification API by injecting an interception script
if (typeof document !== 'undefined') {
  const scriptContent = `
    (function() {
      const OriginalNotification = window.Notification;
      if (!OriginalNotification) return;

      window.Notification = function(title, options) {
        // Dispatch custom event to DOM so preload context can capture data
        const event = new CustomEvent('gradd-notification-triggered', {
          detail: { title, options }
        });
        window.dispatchEvent(event);

        // Keep standard display behaviors
        return new OriginalNotification(title, options);
      };

      // Re-assign native requestPermission and permission properties
      window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
      Object.defineProperty(window.Notification, 'permission', {
        get: () => OriginalNotification.permission
      });
    })();
  `

  const injectScript = (): void => {
    try {
      const script = document.createElement('script')
      script.textContent = scriptContent
      document.documentElement.appendChild(script)
      script.remove()
    } catch (e) {
      console.error('Failed to inject notification patch:', e)
    }
  }

  if (document.documentElement) {
    injectScript()
  } else {
    document.addEventListener('DOMContentLoaded', injectScript)
  }

  // Listen to custom DOM events sent from the website context
  window.addEventListener('gradd-notification-triggered', (e: Event) => {
    // No `instanceof CustomEvent`: the event is created in the page's world, so it fails the
    // check in the isolated preload world. Structural guard on detail instead.
    const detail = (e as CustomEvent<{ title: string; options?: { body?: string } } | null>).detail
    if (!detail) return
    const { title, options } = detail
    ipcRenderer.invoke('show-native-notification', title, options?.body || '').catch(console.error)
  })
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
