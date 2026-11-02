import { describe, expect, it, vi } from 'vitest'

// crypto.ts reads safeStorage from electron; force the "encryption unavailable" base64 path.
vi.mock('electron', () => ({
  default: { safeStorage: { isEncryptionAvailable: () => false } }
}))

import { decryptToken, hashPin, verifyPin } from './crypto'

describe('hashPin / verifyPin', () => {
  it('verifies the correct PIN and rejects a wrong one', () => {
    const stored = hashPin('1234')
    expect(verifyPin('1234', stored)).toEqual({ ok: true, legacy: false })
    expect(verifyPin('1235', stored)).toEqual({ ok: false, legacy: false })
  })

  it('uses a random salt: hashing twice gives different strings', () => {
    expect(hashPin('1234')).not.toBe(hashPin('1234'))
  })

  it('never stores the PIN in plain text', () => {
    expect(hashPin('987654')).not.toContain('987654')
    expect(hashPin('987654').startsWith('scrypt:1:')).toBe(true)
  })

  it('rejects a malformed scrypt value without throwing', () => {
    expect(verifyPin('1234', 'scrypt:1:onlysalt')).toEqual({ ok: false, legacy: false })
  })

  it('flags legacy (pre-scrypt) values so callers can re-hash them', () => {
    const legacy = Buffer.from('4321', 'utf-8').toString('base64')
    expect(verifyPin('4321', legacy)).toEqual({ ok: true, legacy: true })
    expect(verifyPin('0000', legacy)).toEqual({ ok: false, legacy: true })
  })
})

describe('decryptToken', () => {
  it('falls back to base64 when OS encryption is unavailable', () => {
    expect(decryptToken(Buffer.from('secret', 'utf-8').toString('base64'))).toBe('secret')
  })
})
