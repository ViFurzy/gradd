import { create } from 'zustand'
import type { DndConfig, ServiceConfig as SharedServiceConfig } from '../../../shared/types'
import { ACCOUNT_COLORS } from '../../../shared/accountColors'

export type { DndConfig }

export interface ServiceConfig extends SharedServiceConfig {
  unreadCount?: number
}

interface LayoutState {
  layoutMode: 'sidebar' | 'tabs'
  services: ServiceConfig[]
  activeServiceId: string | null
  activePanel: 'directory' | 'settings' | 'service'
  generalConfig: {
    closeToTray: boolean
    showTabLabels: boolean
    saveRam: boolean
    startWithWindows: boolean
    hasAppLock?: boolean
  }
  isLocked: boolean
  setLocked: (locked: boolean) => void
  setLayoutMode: (mode: 'sidebar' | 'tabs') => Promise<void>
  selectService: (id: string | null) => Promise<void>
  toggleService: (id: string) => Promise<void>
  toggleMuteService: (id: string) => Promise<void>
  addServiceInstance: (sourceId: string) => Promise<void>
  removeServiceInstance: (id: string) => Promise<void>
  renameService: (id: string, name: string) => Promise<void>
  setServiceColor: (id: string, color: string) => Promise<void>
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
    config: Partial<{
      closeToTray: boolean
      showTabLabels: boolean
      saveRam: boolean
      startWithWindows: boolean
    }>
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
  generalConfig: { closeToTray: true, showTabLabels: true, saveRam: true, startWithWindows: false },
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
  // Another account of the same service: same type and home URL, its own id (so its own
  // isolated session partition). Built-in entries have id === type; added ones do not.
  addServiceInstance: async (sourceId) => {
    const { services } = get()
    const source = services.find((s) => s.id === sourceId)
    if (!source) return
    const base = services.find((s) => s.id === source.type) ?? source
    let id: string
    do {
      id = `${source.type}-${Math.random().toString(36).slice(2, 8)}`
    } while (services.some((s) => s.id === id))
    const siblings = services.filter((s) => s.type === source.type).length
    const added: ServiceConfig = {
      id,
      name: `${base.name} ${siblings + 1}`,
      color: ACCOUNT_COLORS[siblings % ACCOUNT_COLORS.length],
      type: source.type,
      url: base.url,
      enabled: true,
      muted: false,
      unreadCount: 0
    }
    const at = services.map((s) => s.type).lastIndexOf(source.type) + 1
    const updated = [...services.slice(0, at), added, ...services.slice(at)]
    set({ services: updated })
    await window.api.saveServices(updated)
  },
  removeServiceInstance: async (id) => {
    const target = get().services.find((s) => s.id === id)
    if (!target || target.id === target.type) return // built-in entries can't be removed
    if (get().activeServiceId === id) await get().selectService(null)
    const updated = get().services.filter((s) => s.id !== id)
    set({ services: updated })
    await window.api.saveServices(updated)
  },
  setServiceColor: async (id, color) => {
    const updated = get().services.map((s) => (s.id === id ? { ...s, color } : s))
    set({ services: updated })
    await window.api.saveServices(updated)
  },
  renameService: async (id, name) => {
    const trimmed = name.trim().slice(0, 60)
    if (!trimmed) return
    const updated = get().services.map((s) => (s.id === id ? { ...s, name: trimmed } : s))
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
