import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getLayoutMode: (): Promise<'sidebar' | 'tabs'> => ipcRenderer.invoke('get-layout-mode'),
  setLayoutMode: (mode: 'sidebar' | 'tabs'): Promise<void> => ipcRenderer.invoke('set-layout-mode', mode),
  getServices: (): Promise<any[]> => ipcRenderer.invoke('get-services'),
  saveServices: (services: any[]): Promise<void> => ipcRenderer.invoke('save-services', services),
  switchService: (id: string | null): Promise<void> => ipcRenderer.invoke('switch-service', id),
  updateViewBounds: (bounds: { x: number, y: number, width: number, height: number }): Promise<void> =>
    ipcRenderer.invoke('update-view-bounds', bounds),
  clearStorageData: (): Promise<void> => ipcRenderer.invoke('clear-storage-data'),
  showServiceContextMenu: (id: string): Promise<void> => ipcRenderer.invoke('show-service-context-menu', id),
  clearServiceStorageData: (id: string): Promise<void> => ipcRenderer.invoke('clear-service-storage-data', id),
  onUnreadCountsUpdated: (callback: (data: any) => void): void => {
    ipcRenderer.on('unread-counts-updated', (_event, data) => callback(data))
  },
  updateTaskbarBadge: (dataUrl: string | null, description: string): Promise<void> =>
    ipcRenderer.invoke('update-taskbar-badge', dataUrl, description),
  showNativeNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-native-notification', title, body),
  getDndConfig: (): Promise<any> => ipcRenderer.invoke('get-dnd-config'),
  setDndConfig: (config: any): Promise<void> => ipcRenderer.invoke('set-dnd-config', config),
  getDndActive: (): Promise<boolean> => ipcRenderer.invoke('get-dnd-active'),
  doubleClickHeader: (): Promise<void> => ipcRenderer.invoke('double-click-header'),
  onDndStatusChanged: (callback: (active: boolean) => void): void => {
    ipcRenderer.on('dnd-status-changed', (_event, active) => callback(active))
  },
  onServicesUpdated: (callback: (services: any[]) => void): void => {
    ipcRenderer.on('services-updated', (_event, services) => callback(services))
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version')
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
  `;

  const injectScript = () => {
    try {
      const script = document.createElement('script');
      script.textContent = scriptContent;
      document.documentElement.appendChild(script);
      script.remove();
    } catch (e) {
      console.error('Failed to inject notification patch:', e);
    }
  };

  if (document.documentElement) {
    injectScript();
  } else {
    document.addEventListener('DOMContentLoaded', injectScript);
  }

  // Listen to custom DOM events sent from the website context
  window.addEventListener('gradd-notification-triggered', (e: any) => {
    const { title, options } = e.detail;
    ipcRenderer.invoke('show-native-notification', title, options?.body || '').catch(console.error);
  });
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
