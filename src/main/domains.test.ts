import { describe, expect, it } from 'vitest'
import { getServiceDomains } from './domains'
import { ALLOWED_SERVICE_TYPES } from './validation'

describe('getServiceDomains', () => {
  it('every allowed service type has at least one domain', () => {
    for (const type of ALLOWED_SERVICE_TYPES) {
      expect(getServiceDomains(type).length, type).toBeGreaterThan(0)
    }
  })

  it('returns the expected domains for key services', () => {
    expect(getServiceDomains('whatsapp')).toEqual(['whatsapp.com', 'whatsapp.net'])
    expect(getServiceDomains('slack')).toEqual(['slack.com'])
    expect(getServiceDomains('messenger')).toContain('facebook.com')
  })

  it('returns an empty list for unknown types', () => {
    expect(getServiceDomains('icq')).toEqual([])
  })

  it('never contains a bare TLD or empty entry (would match every host)', () => {
    for (const type of ALLOWED_SERVICE_TYPES) {
      for (const d of getServiceDomains(type)) expect(d).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
    }
  })
})
