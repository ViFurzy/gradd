import { ElectronAPI } from '@electron-toolkit/preload'

export interface ServiceConfig {
  id: string
  name: string
  type: 'messenger' | 'whatsapp' | 'telegram' | 'slack' | 'instagram' | 'gadugadu'
  url: string
  enabled: boolean
  muted?: boolean
}

export interface GraddAPI {
  getLayoutMode(): Promise<'sidebar' | 'tabs'>
  setLayoutMode(mode: 'sidebar' | 'tabs'): Promise<void>
  getServices(): Promise<ServiceConfig[]>
  saveServices(services: ServiceConfig[]): Promise<void>
  switchService(id: string | null): Promise<void>
  updateViewBounds(bounds: { x: number, y: number, width: number, height: number }): Promise<void>
  clearStorageData(): Promise<void>
  showServiceContextMenu(id: string): Promise<void>
  clearServiceStorageData(id: string): Promise<void>
  onUnreadCountsUpdated(callback: (data: { serviceId: string; count: number }) => void): void
  updateTaskbarBadge(dataUrl: string | null, description: string): Promise<void>
  showNativeNotification(title: string, body: string): Promise<void>
  getDndConfig(): Promise<DndConfig>
  setDndConfig(config: DndConfig): Promise<void>
  getDndActive(): Promise<boolean>
  doubleClickHeader(): Promise<void>
  onDndStatusChanged(callback: (active: boolean) => void): void
  onServicesUpdated(callback: (services: ServiceConfig[]) => void): void
  getAppVersion(): Promise<string>
  loginGoogle(): Promise<{ success: boolean; uid?: string; error?: string; photoURL?: string }>
  logoutGoogle(): Promise<{ success: boolean; error?: string }>
  getAuthStatus(): Promise<{ loggedIn: boolean; uid?: string; photoURL?: string }>
  getGeneralConfig(): Promise<{ closeToTray: boolean; showTabLabels: boolean; startWithWindows: boolean }>
  setGeneralConfig(config: { closeToTray: boolean; showTabLabels: boolean; startWithWindows: boolean }): Promise<void>
  exportConfig(): Promise<{ success: boolean; error?: string }>
  importConfig(): Promise<{ success: boolean; error?: string }>
  clearConfig(): Promise<void>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateChecking(callback: () => void): void
  onUpdateAvailable(callback: (info: any) => void): void
  onUpdateNotAvailable(callback: (info: any) => void): void
  onUpdateDownloaded(callback: (info: any) => void): void
  onUpdateError(callback: (error: string) => void): void
  showProfileMenu(): Promise<void>
  onProfileMenuAction(callback: (action: 'settings' | 'logout') => void): void
  openExternal(url: string): Promise<void>
}

export interface DndConfig {
  manualActive: boolean
  scheduleEnabled: boolean
  startTime: string
  endTime: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: GraddAPI
  }
}
