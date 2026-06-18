import { safeStorage, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as http from 'http';

// These should be populated by the user's .env in a real environment
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://127.0.0.1:8765';
const PORT = 8765;

let authServer: http.Server | null = null;

function base64URLEncode(str: Buffer): string {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function loginWithGoogle(): Promise<{ accessToken: string; idToken: string; refreshToken: string }> {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID in your .env file.');
  }

  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${REDIRECT_URI}&` +
    `response_type=code&` +
    `scope=openid%20profile%20email&` +
    `code_challenge=${challenge}&` +
    `code_challenge_method=S256&` +
    `access_type=offline&` +
    `prompt=consent`;

  return new Promise((resolve, reject) => {
    let authWindow: BrowserWindow | null = null;

    if (authServer) {
      authServer.close();
    }

    authServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      if (url.pathname === '/') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.end('<h1>Authentication failed</h1><p>You can close this window.</p>');
          if (authServer) authServer.close();
          if (authWindow) authWindow.close();
          reject(new Error(`OAuth Error: ${error}`));
          return;
        }

        if (code) {
          res.end('<h1>Authentication successful!</h1><p>You can close this window and return to Gradd.</p>');
          if (authServer) authServer.close();
          if (authWindow) authWindow.close();

          try {
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                redirect_uri: REDIRECT_URI,
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
        } else {
          res.end('Invalid request');
        }
      }
    });

    authServer.listen(PORT, '127.0.0.1', () => {
      authWindow = new BrowserWindow({
        width: 600,
        height: 750,
        title: 'Sign in with Google',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      // Circumvent 'disallowed_useragent' by using a standard Chrome user agent
      authWindow.webContents.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
      authWindow.loadURL(authUrl);
      
      authWindow.once('ready-to-show', () => {
        if (authWindow) authWindow.show();
      });

      authWindow.on('closed', () => {
        authWindow = null;
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (authServer) {
        authServer.close();
        if (authWindow) authWindow.close();
        reject(new Error('Authentication timed out.'));
      }
    }, 5 * 60 * 1000);
  });
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; idToken: string }> {
  if (!CLIENT_ID) {
    throw new Error('Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID in your .env file.');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
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
  // Fallback if encryption is not available (e.g. Linux without keyring)
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
