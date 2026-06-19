import { safeStorage, shell } from 'electron';
import * as crypto from 'crypto';
import * as http from 'http';

// Public client ID only — no client secret needed for PKCE (native/desktop app flow).
// The code_verifier/code_challenge pair is the proof of possession; a secret bundled
// inside an Electron binary would be trivially extractable from the asar archive.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

let authServer: http.Server | null = null;

function base64URLEncode(str: Buffer): string {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function loginWithGoogle(): Promise<{ accessToken: string; idToken: string; refreshToken: string }> {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID is missing. Set VITE_GOOGLE_CLIENT_ID in your .env file.');
  }

  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());

  return new Promise((resolve, reject) => {
    // Populated once the OS assigns a port; used in both the auth URL and token exchange.
    let redirectUri = '';

    if (authServer) authServer.close();

    authServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      if (url.pathname !== '/') return;

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      // Friendly page shown in the browser after redirect
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        error
          ? `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
              <h2>Authentication failed</h2><p>You can close this tab and return to Gradd.</p>
             </body></html>`
          : `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
              <h2>Signed in successfully!</h2><p>You can close this tab and return to Gradd.</p>
             </body></html>`
      );

      if (authServer) { authServer.close(); authServer = null; }

      if (error) { reject(new Error(`OAuth Error: ${error}`)); return; }
      if (!code) { reject(new Error('No authorization code received.')); return; }

      try {
        // PKCE token exchange — no client_secret; the code_verifier proves possession of
        // the original code_challenge without needing a bundled secret.
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier
          })
        });

        const tokens = await tokenResponse.json();
        if (tokens.error) {
          reject(new Error(tokens.error_description || tokens.error));
        } else {
          resolve({
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            refreshToken: tokens.refresh_token
          });
        }
      } catch (err) {
        reject(err);
      }
    });

    // port: 0 lets the OS pick a free port — prevents another local process from
    // pre-binding to a hardcoded port and racing the OAuth callback.
    authServer.listen(0, '127.0.0.1', () => {
      const addr = authServer!.address() as { port: number };
      redirectUri = `http://127.0.0.1:${addr.port}`;

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(CLIENT_ID)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=openid%20profile%20email&` +
        `code_challenge=${challenge}&` +
        `code_challenge_method=S256&` +
        `access_type=offline&` +
        `prompt=consent`;

      // Open in the user's real default browser — no UA spoofing, no embedded WebView warnings,
      // and the user sees their full Google account history/picker.
      shell.openExternal(authUrl).catch((err) => {
        if (authServer) { authServer.close(); authServer = null; }
        reject(new Error(`Failed to open browser: ${err.message}`));
      });
    });

    authServer.once('error', (err) => {
      reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
    });

    // Abort after 5 minutes
    setTimeout(() => {
      if (authServer) {
        authServer.close();
        authServer = null;
        reject(new Error('Authentication timed out.'));
      }
    }, 5 * 60 * 1000);
  });
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; idToken: string }> {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID is missing. Set VITE_GOOGLE_CLIENT_ID in your .env file.');
  }

  // No client_secret — public PKCE client refresh flow.
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const tokens = await tokenResponse.json();
  if (tokens.error) {
    throw new Error(tokens.error_description || tokens.error);
  }

  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token
  };
}

export function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64');
  }
  // safeStorage unavailable (e.g. Linux without a keyring). Log a warning — the token
  // is stored as base64 only, which is encoding not encryption.
  console.warn('[Auth] safeStorage unavailable — refresh token stored without encryption.');
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
