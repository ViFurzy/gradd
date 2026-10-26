import electron from 'electron'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
const { safeStorage } = electron

const PIN_PREFIX = 'scrypt:1:'

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 32)
  return `${PIN_PREFIX}${salt.toString('base64')}:${hash.toString('base64')}`
}

// Legacy values are safeStorage-encrypted PINs (pre-scrypt); callers re-hash them on success.
export function verifyPin(pin: string, stored: string): { ok: boolean; legacy: boolean } {
  if (!stored.startsWith(PIN_PREFIX)) {
    return { ok: decryptToken(stored) === pin, legacy: true }
  }
  const [saltB64, hashB64] = stored.slice(PIN_PREFIX.length).split(':')
  if (!saltB64 || !hashB64) return { ok: false, legacy: false }
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(pin, Buffer.from(saltB64, 'base64'), expected.length || 32)
  return {
    ok: expected.length === actual.length && timingSafeEqual(expected, actual),
    legacy: false
  }
}

export function decryptToken(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (e) {
      console.error('Failed to decrypt token:', e)
      return ''
    }
  }
  return Buffer.from(encrypted, 'base64').toString('utf-8')
}
