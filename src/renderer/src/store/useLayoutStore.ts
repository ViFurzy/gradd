import { create } from 'zustand'

export interface ServiceConfig {
  id: string
  name: string
  type:
    | 'messenger'
    | 'whatsapp'
    | 'telegram'
    | 'slack'
    | 'instagram'
    | 'gadugadu'
    | 'linkedin'
    | 'teams'
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
  generalConfig: {
    closeToTray: boolean
    showTabLabels: boolean
    startWithWindows: boolean
    hasAppLock?: boolean
  }
  isLocked: boolean
  setLocked: (locked: boolean) => void
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
  reorderServices: (enabledServices: ServiceConfig[]) => void
  updateGeneralConfig: (
    config: Partial<{ closeToTray: boolean; showTabLabels: boolean; startWithWindows: boolean }>
  ) => Promise<void>
  setAppPin: (pin: string, currentPin?: string) => Promise<boolean>
  verifyAppPin: (pin: string) => Promise<{ ok: boolean; retryAfterMs?: number }>
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layoutMode: 'sidebar',
  services: [],
  activeServiceId: null,
  activePanel: 'directory',
  dndConfig: {
    manualActive: false,
    scheduleEnabled: false,
    startTime: '22:00',
    endTime: '08:00'
  },
  generalConfig: { closeToTray: true, showTabLabels: true, startWithWindows: false },
  isDndActive: false,
  isLocked: false,
  setLocked: (locked) => set({ isLocked: locked }),
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
        generalConfig,
        activePanel: 'directory', // Start on the directory dashboard
        isLocked: !!generalConfig.hasAppLock
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
    const existing = get().services.find((s) => s.id === id)
    if (!existing || (existing.unreadCount ?? 0) === count) return
    set({ services: get().services.map((s) => (s.id === id ? { ...s, unreadCount: count } : s)) })
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
  // Local only; the drag-end handler persists once via saveServices
  reorderServices: (enabledServices) => {
    const disabledServices = get().services.filter((s) => !s.enabled)
    set({ services: [...enabledServices, ...disabledServices] })
  },
  setAppPin: async (pin: string, currentPin?: string) => {
    const success = await window.api.setAppPin(pin, currentPin)
    if (success) {
      set((state) => ({ generalConfig: { ...state.generalConfig, hasAppLock: !!pin } }))
    }
    return success
  },
  verifyAppPin: async (pin: string) => {
    return await window.api.verifyAppPin(pin)
  }
}))
