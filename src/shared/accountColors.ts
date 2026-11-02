import type { ServiceConfig } from './types'

// Muted accents used to tell accounts of the same service apart (dots, badges).
export const ACCOUNT_COLORS = ['#4fb3a5', '#e0a458', '#d4678a', '#8f7cf0', '#7bb661']

// An account's own color, or the palette default for its position among accounts of its type.
export function accountColor(services: ServiceConfig[], id: string): string {
  const service = services.find((s) => s.id === id)
  if (service?.color) return service.color
  const index = services.filter((s) => s.type === service?.type).findIndex((s) => s.id === id)
  return ACCOUNT_COLORS[Math.max(index, 0) % ACCOUNT_COLORS.length]
}
