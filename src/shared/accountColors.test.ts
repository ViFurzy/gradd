import { describe, expect, it } from 'vitest'
import { ACCOUNT_COLORS, accountColor } from './accountColors'
import type { ServiceConfig } from './types'

const svc = (id: string, type: ServiceConfig['type'], color?: string): ServiceConfig => ({
  id,
  name: id,
  type,
  url: 'https://example.com',
  enabled: true,
  ...(color ? { color } : {})
})

describe('accountColor', () => {
  it('defaults to the palette by position among accounts of the same type', () => {
    const list = [svc('messenger', 'messenger'), svc('slack', 'slack'), svc('m2', 'messenger')]
    expect(accountColor(list, 'messenger')).toBe(ACCOUNT_COLORS[0])
    expect(accountColor(list, 'm2')).toBe(ACCOUNT_COLORS[1])
    expect(accountColor(list, 'slack')).toBe(ACCOUNT_COLORS[0])
  })

  it('prefers an explicit color', () => {
    const list = [svc('messenger', 'messenger', '#112233')]
    expect(accountColor(list, 'messenger')).toBe('#112233')
  })

  it('wraps around the palette and tolerates unknown ids', () => {
    const many = Array.from({ length: ACCOUNT_COLORS.length + 1 }, (_, i) =>
      svc(`m${i}`, 'messenger')
    )
    expect(accountColor(many, `m${ACCOUNT_COLORS.length}`)).toBe(ACCOUNT_COLORS[0])
    expect(accountColor(many, 'missing')).toBe(ACCOUNT_COLORS[0])
  })
})
