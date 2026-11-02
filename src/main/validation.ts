import type { ServiceConfig } from '../shared/types'

export const ALLOWED_SERVICE_TYPES = [
  'messenger',
  'whatsapp',
  'telegram',
  'slack',
  'instagram',
  'gadugadu',
  'linkedin',
  'teams'
]

export function validateService(svc: unknown): string | null {
  if (!svc || typeof svc !== 'object') return 'Each service must be an object.'
  const s = svc as Record<string, unknown>
  // The id becomes part of the session partition name, so keep it to a safe charset.
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.id))
    return 'Service "id" must be 1-64 characters of letters, digits, "-" or "_".'
  if (typeof s.name !== 'string' || !s.name) return 'Service "name" must be a non-empty string.'
  if (s.name.length > 60) return 'Service "name" must be at most 60 characters.'
  if (typeof s.enabled !== 'boolean') return 'Service "enabled" must be a boolean.'
  if (s.muted !== undefined && typeof s.muted !== 'boolean')
    return 'Service "muted" must be a boolean.'
  if (!ALLOWED_SERVICE_TYPES.includes(s.type as string))
    return `Service type "${s.type}" is not recognised.`
  if (s.color !== undefined && (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)))
    return 'Service "color" must be a #rrggbb hex value.'
  if (typeof s.url !== 'string') return 'Service "url" must be a string.'
  try {
    const parsed = new URL(s.url as string)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return `Service URL "${s.url}" must use http or https.`
  } catch {
    return `Service URL "${s.url}" is not a valid URL.`
  }
  return null
}

// Validates every service and rejects duplicate ids (two entries would share one session).
export function validateServiceList(list: unknown[]): string | null {
  const seen = new Set<string>()
  for (const svc of list) {
    const reason = validateService(svc)
    if (reason) return reason
    const id = (svc as { id: string }).id
    if (seen.has(id)) return `Duplicate service id "${id}".`
    seen.add(id)
  }
  return null
}

export function validateDnd(dnd: unknown): string | null {
  if (!dnd || typeof dnd !== 'object' || Array.isArray(dnd)) return '"dnd" must be an object.'
  const d = dnd as Record<string, unknown>
  if (typeof d.manualActive !== 'boolean') return '"dnd.manualActive" must be a boolean.'
  if (typeof d.scheduleEnabled !== 'boolean') return '"dnd.scheduleEnabled" must be a boolean.'
  if (typeof d.startTime !== 'string' || !/^\d{2}:\d{2}$/.test(d.startTime as string))
    return '"dnd.startTime" must be HH:MM format.'
  if (typeof d.endTime !== 'string' || !/^\d{2}:\d{2}$/.test(d.endTime as string))
    return '"dnd.endTime" must be HH:MM format.'
  return null
}

// Keep only known fields (drops renderer-only transient state such as unreadCount).
export const sanitizeService = (s: ServiceConfig): ServiceConfig => ({
  id: s.id,
  name: s.name,
  type: s.type,
  url: s.url,
  enabled: s.enabled,
  ...(typeof s.muted === 'boolean' ? { muted: s.muted } : {}),
  ...(typeof s.color === 'string' ? { color: s.color } : {})
})

export function validateImportedConfig(data: unknown): { valid: boolean; reason?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Root value must be an object.' }
  }
  const obj = data as Record<string, unknown>

  if (obj.services !== undefined) {
    if (!Array.isArray(obj.services))
      return { valid: false, reason: '"services" must be an array.' }
    const reason = validateServiceList(obj.services)
    if (reason) return { valid: false, reason }
  }

  if (obj.dnd !== undefined) {
    const reason = validateDnd(obj.dnd)
    if (reason) return { valid: false, reason }
  }

  if (obj.layout !== undefined) {
    if (typeof obj.layout !== 'object' || Array.isArray(obj.layout))
      return { valid: false, reason: '"layout" must be an object.' }
    const layout = obj.layout as Record<string, unknown>
    if (layout.mode !== undefined && layout.mode !== 'sidebar' && layout.mode !== 'tabs') {
      return { valid: false, reason: '"layout.mode" must be "sidebar" or "tabs".' }
    }
  }

  if (obj.general !== undefined) {
    if (typeof obj.general !== 'object' || Array.isArray(obj.general))
      return { valid: false, reason: '"general" must be an object.' }
    const general = obj.general as Record<string, unknown>
    if (general.closeToTray !== undefined && typeof general.closeToTray !== 'boolean') {
      return { valid: false, reason: '"general.closeToTray" must be a boolean.' }
    }
    if (general.showTabLabels !== undefined && typeof general.showTabLabels !== 'boolean') {
      return { valid: false, reason: '"general.showTabLabels" must be a boolean.' }
    }
    if (general.saveRam !== undefined && typeof general.saveRam !== 'boolean') {
      return { valid: false, reason: '"general.saveRam" must be a boolean.' }
    }
  }

  return { valid: true }
}
