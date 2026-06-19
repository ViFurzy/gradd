import electron from 'electron';
const { safeStorage, shell, net } = electron;
import * as crypto from 'crypto';
import * as http from 'http';

// Google requires client_secret even for Desktop app credentials (token exchange step).
// For Desktop/installed apps, Google acknowledges the secret is not truly confidential.
// PKCE provides additional protection but does not replace the client_secret requirement.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

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
    let redirectUri = '';

    if (authServer) authServer.close();

    const favicon = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%236366f1'/><text y='74' x='50' text-anchor='middle' font-size='62' font-family='system-ui,sans-serif' font-weight='700' fill='white'>G</text></svg>`;
    const sharedStyles = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f0f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{text-align:center;padding:2.5rem 3rem;background:#161616;border:1px solid #222;border-radius:16px;width:340px}.logo{display:inline-flex;align-items:center;gap:9px;margin-bottom:2rem}.logo-icon{width:30px;height:30px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;letter-spacing:-1px}.logo-name{font-size:17px;font-weight:600;letter-spacing:-.3px}.icon-ring{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem}h1{font-size:1.0625rem;font-weight:600;margin-bottom:.375rem}p{color:#777;font-size:.8125rem;line-height:1.5}.note{margin-top:1.25rem;font-size:.75rem;color:#444}`;

    authServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      if (url.pathname !== '/') return;

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(error
        ? `<!doctype html><html><head><meta charset="utf-8"><title>Gradd</title><link rel="icon" href="${favicon}"><style>${sharedStyles}.icon-ring{background:rgba(239,68,68,.12);color:#ef4444}</style></head><body>
<div class="card">
  <div class="logo"><div class="logo-icon">G</div><span class="logo-name">Gradd</span></div>
  <div class="icon-ring"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
  <h1>Authentication failed</h1>
  <p>You can close this tab and try again in Gradd.</p>
</div>
</body></html>`
        : `<!doctype html><html><head><meta charset="utf-8"><title>Gradd</title><link rel="icon" href="${favicon}"><style>${sharedStyles}.icon-ring{background:rgba(34,197,94,.12);color:#22c55e}</style></head><body>
<div class="card">
  <div class="logo"><div class="logo-icon">G</div><span class="logo-name">Gradd</span></div>
  <div class="icon-ring"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
  <h1>Signed in successfully!</h1>
  <p>You can now return to Gradd.</p>
  <p class="note" id="msg">Closing in <span id="n">3</span>…</p>
</div>
<script>var t=3,n=document.getElementById('n'),m=document.getElementById('msg'),i=setInterval(function(){n.textContent=--t;if(t<=0){clearInterval(i);window.close();setTimeout(function(){m.textContent='You can now close this tab.';},200);}},1000);</script>
</body></html>`);

      if (authServer) { authServer.close(); authServer = null; }

      if (error) { reject(new Error(`OAuth Error: ${error}`)); return; }
      if (!code) { reject(new Error('No authorization code received.')); return; }

      try {
        const tokenResponse = await net.fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: verifier
          }).toString()
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

    // port: 0 lets the OS pick a free port — prevents port conflicts
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

      shell.openExternal(authUrl).catch((err: Error) => {
        if (authServer) { authServer.close(); authServer = null; }
        reject(new Error(`Failed to open browser: ${err.message}`));
      });
    });

    authServer.once('error', (err) => {
      reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
    });

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

  const tokenResponse = await net.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
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

export async function getGoogleUserInfo(accessToken: string): Promise<{ uid: string; name: string; email: string; photoURL: string }> {
  const response = await net.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Failed to fetch user info: ${response.status}`);
  const info = await response.json();
  return { uid: info.sub, name: info.name, email: info.email, photoURL: info.picture || '' };
}

export function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64');
  }
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
