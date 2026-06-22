import { create } from 'zustand'

export interface ServiceConfig {
  id: string
  name: string
  type: 'messenger' | 'whatsapp' | 'telegram' | 'slack' | 'instagram' | 'gadugadu'
  url: string
  enabled: boolean
  unreadCount?: number
  muted?: boolean
}

export interface DndConfig {
  manualActive: boolean
  scheduleEnabled: boolean
  startTime: string
  endTime: string
}

interface LayoutState {
  layoutMode: 'sidebar' | 'tabs'
  services: ServiceConfig[]
  activeServiceId: string | null
  activePanel: 'directory' | 'settings' | 'service'
  authState: { loggedIn: boolean; uid?: string; photoURL?: string }
  generalConfig: { closeToTray: boolean; showTabLabels: boolean; startWithWindows: boolean }
  setLayoutMode: (mode: 'sidebar' | 'tabs') => Promise<void>
  selectService: (id: string | null) => Promise<void>
  toggleService: (id: string) => Promise<void>
  toggleMuteService: (id: string) => Promise<void>
  showDirectory: () => Promise<void>
  showSettings: () => Promise<void>
  initialize: () => Promise<void>
  setServiceUnreadCount: (id: string, count: number) => void
  dndConfig: DndConfig
  isDndActive: boolean
  updateDndConfig: (config: Partial<DndConfig>) => Promise<void>
  setDndActiveState: (active: boolean) => void
  reorderServices: (enabledServices: ServiceConfig[]) => Promise<void>
  updateGeneralConfig: (config: Partial<{ closeToTray: boolean; showTabLabels: boolean; startWithWindows: boolean }>) => Promise<void>
  loginGoogle: () => Promise<void>
  logoutGoogle: () => Promise<void>
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layoutMode: 'sidebar',
  services: [],
  activeServiceId: null,
  activePanel: 'directory',
  authState: { loggedIn: false },
  dndConfig: {
    manualActive: false,
    scheduleEnabled: false,
    startTime: '22:00',
    endTime: '08:00'
  },
  generalConfig: { closeToTray: true, showTabLabels: true, startWithWindows: false },
  isDndActive: false,
  setLayoutMode: async (mode) => {
    set({ layoutMode: mode })
    await window.api.setLayoutMode(mode)
  },
  selectService: async (id) => {
    if (id === null) {
      set({ activeServiceId: null, activePanel: 'directory' })
      await window.api.switchService(null)
    } else {
      set({ activeServiceId: id, activePanel: 'service' })
      await window.api.switchService(id)
      // Unread count is NOT cleared here — the periodic scraper clears it once
      // the DOM badges actually disappear (i.e. the user has read the messages).
    }
  },
  toggleService: async (id) => {
    const updated = get().services.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    set({ services: updated })
    await window.api.saveServices(updated)

    // If active service was disabled, deselect it and show directory
    const isNowDisabled = updated.find((s) => s.id === id && !s.enabled)
    if (isNowDisabled && get().activeServiceId === id) {
      await get().selectService(null)
    }
  },
  toggleMuteService: async (id) => {
    const updated = get().services.map((s) => (s.id === id ? { ...s, muted: !s.muted } : s))
    set({ services: updated })
    await window.api.saveServices(updated)
  },
  showDirectory: async () => {
    set({ activeServiceId: null, activePanel: 'directory' })
    await window.api.switchService(null)
  },
  showSettings: async () => {
    set({ activeServiceId: null, activePanel: 'settings' })
    await window.api.switchService(null)
  },
  initialize: async () => {
    try {
      const mode = await window.api.getLayoutMode()
      const servicesList = await window.api.getServices()
      const dnd = await window.api.getDndConfig()
      const dndActiveState = await window.api.getDndActive()
      const authState = await window.api.getAuthStatus()
      const generalConfig = await window.api.getGeneralConfig()
      
      const servicesWithUnread = servicesList.map((s) => ({
        ...s,
        unreadCount: 0
      }))

      set({
        layoutMode: mode,
        services: servicesWithUnread,
        dndConfig: dnd,
        isDndActive: dndActiveState,
        authState,
        generalConfig,
        activePanel: 'directory' // Start on the directory dashboard
      })

      // Select first enabled service if any are available
      const enabledServices = servicesList.filter((s) => s.enabled)
      if (enabledServices.length > 0) {
        // Slightly delay to allow the React container element to render and measure initial bounds
        setTimeout(() => {
          get().selectService(enabledServices[0].id)
        }, 100)
      }
    } catch (error) {
      console.error('Failed to initialize layout store:', error)
    }
  },
  setServiceUnreadCount: (id, count) => {
    const updated = get().services.map((s) => (s.id === id ? { ...s, unreadCount: count } : s))
    set({ services: updated })
  },
  updateDndConfig: async (config) => {
    const updated = { ...get().dndConfig, ...config }
    set({ dndConfig: updated })
    await window.api.setDndConfig(updated)
  },
  updateGeneralConfig: async (config) => {
    const updated = { ...get().generalConfig, ...config }
    set({ generalConfig: updated })
    await window.api.setGeneralConfig(updated)
  },
  setDndActiveState: (active) => {
    set({ isDndActive: active })
  },
  reorderServices: async (enabledServices) => {
    const disabledServices = get().services.filter((s) => !s.enabled)
    const updated = [...enabledServices, ...disabledServices]
    set({ services: updated })
    await window.api.saveServices(updated)
  },
  loginGoogle: async () => {
    const result = await window.api.loginGoogle()
    if (result.success) {
      set({ authState: { loggedIn: true, uid: result.uid, photoURL: result.photoURL } })
    } else {
      throw new Error(result.error || 'Login failed')
    }
  },
  logoutGoogle: async () => {
    const result = await window.api.logoutGoogle()
    if (result.success) {
      set({ authState: { loggedIn: false } })
    }
  }
}))
