// Type-only contract shared by main, preload and renderer. Keep import-free.

export type ServiceType =
  | 'messenger'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'instagram'
  | 'gadugadu'
  | 'linkedin'
  | 'teams'

export interface ServiceConfig {
  id: string
  name: string
  type: ServiceType
  url: string
  enabled: boolean
  muted?: boolean
}

export interface DndConfig {
  manualActive: boolean
  scheduleEnabled: boolean
  startTime: string
  endTime: string
}

export interface GeneralConfig {
  closeToTray: boolean
  showTabLabels: boolean
  startWithWindows: boolean
}

export type GeneralConfigView = GeneralConfig & { hasAppLock: boolean }

// Subset of electron-updater's UpdateInfo that crosses IPC
export interface UpdateInfo {
  version?: string
}
