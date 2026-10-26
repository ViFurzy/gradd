import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  DndConfig,
  GeneralConfig,
  GeneralConfigView,
  ServiceConfig,
  UpdateInfo
} from '../shared/types'

export type { DndConfig, ServiceConfig }

export interface GraddAPI {
  getLayoutMode(): Promise<'sidebar' | 'tabs'>
  setLayoutMode(mode: 'sidebar' | 'tabs'): Promise<void>
  getServices(): Promise<ServiceConfig[]>
  saveServices(services: ServiceConfig[]): Promise<void>
  switchService(id: string | null): Promise<void>
  updateViewBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>
  clearStorageData(): Promise<void>
  showServiceContextMenu(id: string): Promise<void>
  clearServiceStorageData(id: string): Promise<void>
  onUnreadCountsUpdated(callback: (data: { serviceId: string; count: number }) => void): () => void
  updateTaskbarBadge(dataUrl: string | null, description: string): Promise<void>
  showNativeNotification(title: string, body: string): Promise<void>
  getDndConfig(): Promise<DndConfig>
  setDndConfig(config: DndConfig): Promise<void>
  getDndActive(): Promise<boolean>
  doubleClickHeader(): Promise<void>
  onDndStatusChanged(callback: (active: boolean) => void): () => void
  onServicesUpdated(callback: (services: ServiceConfig[]) => void): () => void
  getAppVersion(): Promise<string>
  getActiveUserStats(): Promise<{ dau: number; mau: number } | null>
  getGeneralConfig(): Promise<GeneralConfigView>
  setGeneralConfig(config: GeneralConfig): Promise<void>
  exportConfig(): Promise<{ success: boolean; error?: string }>
  importConfig(): Promise<{ success: boolean; error?: string }>
  clearConfig(): Promise<void>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateChecking(callback: () => void): () => void
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void
  onUpdateNotAvailable(callback: (info: UpdateInfo) => void): () => void
  onUpdateDownloaded(callback: (info: UpdateInfo) => void): () => void
  onUpdateError(callback: (error: string) => void): () => void
  openExternal(url: string): Promise<void>
  setAppPin(pin: string, currentPin?: string): Promise<boolean>
  verifyAppPin(pin: string): Promise<{ ok: boolean; retryAfterMs?: number }>
  onLockApp(callback: () => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: GraddAPI
  }
}
