import electron from 'electron';
const { safeStorage } = electron;

export function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64');
  }
  console.warn('[Crypto] safeStorage unavailable — value stored without encryption.');
  return Buffer.from(token).toString('base64');
}

export function decryptToken(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (e) {
      console.error('Failed to decrypt token:', e);
      return '';
    }
  }
  return Buffer.from(encrypted, 'base64').toString('utf-8');
}
