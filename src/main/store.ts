import Store from 'electron-store'

export interface ServiceConfig {
  id: string
  name: string
  type: 'messenger' | 'whatsapp' | 'telegram' | 'slack' | 'instagram' | 'gadugadu'
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

export interface AppConfig {
  layout: {
    mode: 'sidebar' | 'tabs'
  }
  window: {
    bounds: {
      x?: number
      y?: number
      width: number
      height: number
      maximized: boolean
    }
  }
  services: ServiceConfig[]
  dnd: DndConfig
}

export const defaultServices: ServiceConfig[] = [
  {
    id: 'messenger',
    name: 'Messenger',
    type: 'messenger',
    url: 'https://www.messenger.com',
    enabled: true,
    muted: false
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    type: 'whatsapp',
    url: 'https://web.whatsapp.com',
    enabled: true,
    muted: false
  },
  {
    id: 'telegram',
    name: 'Telegram',
    type: 'telegram',
    url: 'https://web.telegram.org',
    enabled: true,
    muted: false
  },
  {
    id: 'slack',
    name: 'Slack',
    type: 'slack',
    url: 'https://app.slack.com',
    enabled: true,
    muted: false
  },
  {
    id: 'instagram',
    name: 'Instagram Direct',
    type: 'instagram',
    url: 'https://www.instagram.com/direct/inbox/',
    enabled: false,
    muted: false
  },
  {
    id: 'gadugadu',
    name: 'Gadu-Gadu',
    type: 'gadugadu',
    url: 'https://gg.pl',
    enabled: false,
    muted: false
  }
]

export const store = new Store<AppConfig>({
  name: 'config',
  defaults: {
    layout: {
      mode: 'sidebar'
    },
    window: {
      bounds: {
        width: 1200,
        height: 800,
        maximized: false
      }
    },
    services: defaultServices,
    dnd: {
      manualActive: false,
      scheduleEnabled: false,
      startTime: '22:00',
      endTime: '08:00'
    }
  }
})

// Ensure any new default services are merged into the existing configuration
try {
  const currentServices = store.get('services') || []
  let hasChanges = false
  
  for (const defService of defaultServices) {
    if (!currentServices.some((s) => s.id === defService.id)) {
      currentServices.push(defService)
      hasChanges = true
    }
  }

  if (hasChanges) {
    store.set('services', currentServices)
  }
} catch (error) {
  console.error('Failed to merge default services:', error)
}

// Ensure DND configuration exists in the store
try {
  if (!store.has('dnd')) {
    store.set('dnd', {
      manualActive: false,
      scheduleEnabled: false,
      startTime: '22:00',
      endTime: '08:00'
    })
  }
} catch (error) {
  console.error('Failed to initialize DND store key:', error)
}
