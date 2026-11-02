import { describe, expect, it } from 'vitest'
import {
  ALLOWED_SERVICE_TYPES,
  sanitizeService,
  validateDnd,
  validateImportedConfig,
  validateService,
  validateServiceList
} from './validation'
import type { ServiceConfig } from '../shared/types'

const svc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'messenger',
  name: 'Messenger',
  type: 'messenger',
  url: 'https://www.messenger.com',
  enabled: true,
  ...over
})

describe('validateService', () => {
  it('accepts a valid service, with or without muted', () => {
    expect(validateService(svc())).toBeNull()
    expect(validateService(svc({ muted: true }))).toBeNull()
  })

  it('accepts every allowed type', () => {
    for (const type of ALLOWED_SERVICE_TYPES) expect(validateService(svc({ type }))).toBeNull()
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['empty id', svc({ id: '' })],
    ['non-string id', svc({ id: 5 })],
    ['empty name', svc({ name: '' })],
    ['non-boolean enabled', svc({ enabled: 'yes' })],
    ['non-boolean muted', svc({ muted: 1 })],
    ['unknown type', svc({ type: 'icq' })],
    ['non-string url', svc({ url: 42 })],
    ['invalid url', svc({ url: 'not a url' })],
    ['javascript: url', svc({ url: 'javascript:alert(1)' })],
    ['file: url', svc({ url: 'file:///C:/Windows/win.ini' })]
  ])('rejects %s', (_label, input) => {
    expect(validateService(input)).toEqual(expect.any(String))
  })
})

describe('sanitizeService', () => {
  it('drops unknown and renderer-only fields', () => {
    const dirty = { ...svc(), unreadCount: 7, evil: 'x' } as unknown as ServiceConfig
    expect(sanitizeService(dirty)).toEqual({
      id: 'messenger',
      name: 'Messenger',
      type: 'messenger',
      url: 'https://www.messenger.com',
      enabled: true
    })
  })

  it('keeps muted only when it is a boolean', () => {
    expect(sanitizeService(svc({ muted: false }) as unknown as ServiceConfig)).toHaveProperty(
      'muted',
      false
    )
    expect(sanitizeService(svc({ muted: 'x' }) as unknown as ServiceConfig)).not.toHaveProperty(
      'muted'
    )
  })
})

describe('validateDnd', () => {
  const dnd = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    manualActive: false,
    scheduleEnabled: true,
    startTime: '22:00',
    endTime: '08:00',
    ...over
  })

  it('accepts a valid config', () => expect(validateDnd(dnd())).toBeNull())

  it.each([
    ['an array', []],
    ['null', null],
    ['non-boolean manualActive', dnd({ manualActive: 'no' })],
    ['non-boolean scheduleEnabled', dnd({ scheduleEnabled: 0 })],
    ['bad startTime', dnd({ startTime: '9:00' })],
    ['bad endTime', dnd({ endTime: '25h' })],
    ['non-string time', dnd({ startTime: 2200 })]
  ])('rejects %s', (_label, input) => {
    expect(validateDnd(input)).toEqual(expect.any(String))
  })
})

describe('validateImportedConfig', () => {
  const ok = (data: unknown): boolean => validateImportedConfig(data).valid

  it('accepts an empty object and a full valid config', () => {
    expect(ok({})).toBe(true)
    expect(
      ok({
        services: [svc()],
        dnd: { manualActive: false, scheduleEnabled: false, startTime: '22:00', endTime: '08:00' },
        layout: { mode: 'tabs' },
        general: { closeToTray: true, showTabLabels: false, saveRam: true }
      })
    ).toBe(true)
  })

  it.each([
    ['root array', []],
    ['root null', null],
    ['services not an array', { services: {} }],
    ['an invalid service', { services: [svc({ type: 'icq' })] }],
    ['invalid dnd', { dnd: { manualActive: 'x' } }],
    ['layout array', { layout: [] }],
    ['unknown layout mode', { layout: { mode: 'grid' } }],
    ['general array', { general: [] }],
    ['non-boolean closeToTray', { general: { closeToTray: 'yes' } }],
    ['non-boolean showTabLabels', { general: { showTabLabels: 1 } }],
    ['non-boolean saveRam', { general: { saveRam: 'on' } }]
  ])('rejects %s', (_label, data) => {
    const result = validateImportedConfig(data)
    expect(result.valid).toBe(false)
    expect(result.reason).toEqual(expect.any(String))
  })
})

describe('service ids and names (multi-account safety)', () => {
  it.each([
    ['a path separator', 'a/b'],
    ['a dot-dot', '..'],
    ['a space', 'a b'],
    ['a colon', 'x:y'],
    ['an over-long id', 'a'.repeat(65)]
  ])('rejects an id with %s', (_label, id) => {
    expect(validateService(svc({ id }))).toEqual(expect.any(String))
  })

  it('accepts generated multi-account ids', () => {
    expect(validateService(svc({ id: 'messenger-k3j9xz' }))).toBeNull()
  })

  it('rejects names longer than 60 characters', () => {
    expect(validateService(svc({ name: 'x'.repeat(61) }))).toEqual(expect.any(String))
    expect(validateService(svc({ name: 'x'.repeat(60) }))).toBeNull()
  })
})

describe('validateServiceList', () => {
  it('accepts several accounts of the same type with distinct ids', () => {
    expect(
      validateServiceList([svc(), svc({ id: 'messenger-ab12cd', name: 'Messenger 2' })])
    ).toBeNull()
  })

  it('rejects duplicate ids (they would share one session)', () => {
    expect(validateServiceList([svc(), svc({ name: 'Other' })])).toMatch(/Duplicate/)
  })

  it('reports the first invalid entry', () => {
    expect(validateServiceList([svc(), svc({ id: 'b', type: 'icq' })])).toMatch(/not recognised/)
  })

  it('is enforced on imported configs too', () => {
    expect(validateImportedConfig({ services: [svc(), svc()] }).valid).toBe(false)
  })
})
