# Technology Stack: Gradd Desktop Chat Aggregator

**Project:** Gradd
**Researched:** 2026-06-17
**Domain:** Windows Electron desktop, multi-service WebView aggregator

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Electron | 35+ (pin to latest stable at project start — currently 42.x) | Desktop runtime | Only framework with full Chromium per-partition session isolation; Tauri uses WebView2 OS component which lacks reliable per-partition persistence needed for WhatsApp/Signal QR sessions |
| Node.js | 24.x (bundled with Electron 42) | Main process runtime | Comes with Electron; no separate install needed |
| TypeScript | 5.x | Language | End-to-end type safety across main/preload/renderer boundaries; essential for the IPC contract surface |

**Electron version note:** Electron releases on a ~12-week cadence. The currently-supported stable versions as of 2026-06-17 are approximately Electron 40-42. Pin to the latest stable at project start. Electron 42.4.1 ships Chromium 148 and Node.js 24.16.0. Support policy covers the latest 3 major versions; do not use anything older than current-3.

### Build & Dev Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-vite | 3.x | Build orchestrator | Single config file covers main/preload/renderer; instant HMR for renderer; hot reload for main/preload without full restart; scaffolds the React+TS template via `npm create @quick-start/electron@latest`; benchmark score 87.89 on Context7 |
| Vite | 6.x (bundled by electron-vite) | Renderer bundler | Sub-100ms HMR; ESBuild transforms; tree-shaking; not Webpack |
| React | 19.x | UI framework | Concurrent rendering; React 19 server components are irrelevant here but hooks model maps well to the service-switcher UI; ecosystem depth for Tailwind component libraries |
| Tailwind CSS | 4.x | Styling | Dark-first design token system; zero-runtime CSS; Linear/Notion aesthetic is achievable without a heavy component library |

### State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | 5.x | Client state | Sub-1KB; no Provider wrapper; slices pattern handles: active service, service list, DND schedule, layout preference; Redux Toolkit is overkill for this scope |

### Persistence

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-store | 10.x | Local config persistence | JSON file in `app.getPath('userData')`; schema validation via JSON Schema; atomic writes (no corruption on crash); TypeScript generics for type-safe get/set |

**ESM caveat (HIGH confidence):** electron-store v10 is pure ESM. The entire main-process codebase must use ESM (`"type": "module"` in package.json, `.mjs` extensions or esm-compatible bundling). electron-vite handles this correctly when using its scaffolded template. Do not mix CJS `require()` in the main process entry point — it breaks v10 imports. The workaround (bundling electron-store into a CJS output via rollup externals override) works but adds friction; ESM-first is cleaner.

### Embedded Service Views

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| WebContentsView + BaseWindow | Electron built-in (30+) | Embed each chat service | BrowserView is deprecated since Electron 30; WebContentsView is the current replacement; uses Chromium Views API directly; fully supported in Electron 35+ |

**Do NOT use `<webview>` tag.** The webview tag is enabled only when `webviewTag: true` is set in webPreferences, is considered a legacy API, and has known security issues with nodeIntegration leakage. WebContentsView with a dedicated session partition achieves full isolation without the webview tag's footguns.

**Do NOT use BrowserView.** Deprecated since Electron 30, removed from the roadmap. Migration to WebContentsView is a direct rename for most APIs.

### Session Isolation

Each service gets its own named persistent session partition:

```
session.fromPartition('persist:messenger')
session.fromPartition('persist:whatsapp')
session.fromPartition('persist:telegram')
session.fromPartition('persist:slack')
session.fromPartition('persist:instagram')
session.fromPartition('persist:signal')
session.fromPartition('persist:gadu-gadu')
```

The `persist:` prefix causes Electron to write the session data (cookies, localStorage, IndexedDB, service workers, cache) to a named subdirectory under `app.getPath('userData')`. Sessions survive app restarts, meaning users stay logged in. In-memory partitions (no `persist:` prefix) are used only for ephemeral/guest contexts.

### Google OAuth2 (Config Sync)

| Approach | Verdict |
|----------|---------|
| Manual PKCE loopback flow | RECOMMENDED |
| electron-google-oauth2 library | NOT recommended — last published 2021, abandoned |
| Embedded webview OAuth | NOT recommended — Google blocks OAuth in embedded browsers |

**Recommended approach:** Manual PKCE + loopback redirect.

Google's current guidance (2024+) for native/desktop apps: use the loopback IP address redirect (`http://127.0.0.1:<random_port>`) combined with PKCE (code_verifier + code_challenge S256). Custom URI scheme redirects are no longer supported by Google for OAuth due to app impersonation risk.

Implementation pattern:
1. Generate `code_verifier` (43-128 char random string) and `code_challenge` (SHA256 of verifier, base64url-encoded)
2. Open `https://accounts.google.com/o/oauth2/v2/auth?...&redirect_uri=http://127.0.0.1:PORT` in `shell.openExternal()` — this opens the user's default browser, NOT an embedded webview (required by Google)
3. Spin up a temporary `http.createServer()` on the random port in the main process to capture the authorization code callback
4. Exchange code for tokens via `https://oauth2.googleapis.com/token` with the code_verifier
5. Store refresh token in electron-store (or OS keychain via `keytar` for additional security)
6. Use access token for Google Drive/Sheets API calls to sync config

Do NOT attempt OAuth in an embedded WebContentsView pointing to Google's auth pages — Google detects embedded Chromium and shows an error since 2021.

### Auto-Update

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-updater | 6.x (part of electron-builder) | Update delivery | Works with NSIS installer on Windows; supports differential downloads (delta updates, not full installer re-download); integrates with GitHub Releases as update feed |

**Architecture for Gradd:** The PROJECT.md spec says "app notifies user when update is available; user installs manually." This maps to `autoUpdater.checkForUpdates()` (not `checkForUpdatesAndNotify()`) combined with a custom UI prompt in the renderer. The user clicks "Install Update" which triggers `autoUpdater.quitAndInstall()`.

```typescript
// main/updater.ts
import { NsisUpdater } from 'electron-updater'
const updater = new NsisUpdater({ provider: 'github', owner: 'org', repo: 'gradd' })
updater.autoDownload = true      // download silently in background
updater.autoInstallOnAppQuit = false  // user controls when to install
updater.on('update-available', (info) => mainWindow.webContents.send('update-available', info))
updater.on('update-downloaded', () => mainWindow.webContents.send('update-ready'))
```

### Build & Packaging

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-builder | 25.x | Packaging + installer | Most mature Electron packager; NSIS is the default/recommended Windows target; Squirrel.Windows is deprecated in electron-builder; portable target available in same config |

**Windows targets:**

```jsonc
// electron-builder.yml (or package.json build key)
{
  "win": {
    "target": ["nsis", "portable"],
    "icon": "build/icon.ico",
    "publisherName": "Gradd"
  },
  "nsis": {
    "oneClick": false,           // wizard-style install (user chooses install dir)
    "perMachine": false,         // per-user install by default (no UAC prompt)
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "Gradd"
  },
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "gradd"
  }
}
```

**Code signing:** Since June 2023, Microsoft requires EV (Extended Validation) code signing certificates for new software to avoid SmartScreen "Unknown Publisher" warnings. Standard OV certificates no longer suppress warnings. For v1 personal use / MVP, unsigned builds are functional but will show a warning on first run. For a wider release, use a cloud HSM signing service (DigiCert KeyLocker, Azure Key Vault HSM) to sign from CI without a physical USB dongle.

**Squirrel vs NSIS:** Use NSIS. Squirrel.Windows is not actively maintained (Electron.NET issue #957 confirms deprecation since Electron 29+). NSIS produces smaller installers and is the electron-builder default for Windows.

### Windows Notifications

| Technology | Purpose | Why |
|------------|---------|-----|
| Electron `Notification` (main process) | Service-level OS toast notifications | Built-in; uses Windows Action Center; supports `toastXml` for full WinRT Toast customization; no native addon required |

**Critical setup:** On Windows, Electron requires `app.setAppUserModelId('com.gradd.app')` called at startup before any notifications are shown. Without it, notifications are silently dropped during development. With NSIS installer, this is set automatically; in dev mode, set it manually.

```typescript
app.setAppUserModelId('com.gradd.app')
```

**Unread detection strategy:** Parse `page-title-updated` events from each WebContentsView's `webContents`. Most chat services encode unread count in the page title (e.g., `"(3) Messenger"`, `"WhatsApp Web"`). Extract the count with a per-service regex. Fall back to `page-favicon-updated` for favicon-badge approaches used by some services.

```typescript
view.webContents.on('page-title-updated', (_, title) => {
  const match = title.match(/\((\d+)\)/)
  const unread = match ? parseInt(match[1]) : 0
  updateServiceBadge(serviceId, unread)
})
```

**Taskbar overlay:** Use `win.setOverlayIcon(nativeImage, description)` on the main `BrowserWindow` to display a 16x16 overlay showing total unread count. Rendered dynamically via `nativeImage.createFromDataURL()` using an offscreen canvas.

**node-notifier: NOT recommended.** It shells out to an external notification executable, adds a native binary dependency, and has lower fidelity on Windows 11 than Electron's built-in `Notification` class with `toastXml`.

### Audio Playback (Custom Notification Sounds)

The PROJECT.md spec requires per-service custom sounds. Audio must play from the shell (main window renderer process), not from within individual service WebContentsViews (which have their own audio contexts and cannot be easily intercepted).

**Approach:** Web Audio API in the shell renderer process.

```typescript
// renderer/audio.ts
const ctx = new AudioContext()
async function playSound(filePath: string) {
  const url = `file://${filePath}` // or bundle sounds as assets
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const decoded = await ctx.decodeAudioData(buf)
  const source = ctx.createBufferSource()
  source.buffer = decoded
  source.connect(ctx.destination)
  source.start()
}
```

Sound files (user-selected or default bundled sounds) are stored in `app.getPath('userData')/sounds/`. The main process exposes a `play-sound` IPC channel; the renderer receives a `notification-triggered` IPC event from main and calls `playSound()`. This keeps audio in the renderer where Web Audio API is available, while the trigger originates in the main process (which monitors unread counts).

**Do NOT use `node-notifier`'s sound parameter** — it plays the OS default notification sound, not a custom file, and is not configurable per-service.

### IPC Architecture

The shell uses `contextBridge` + preload scripts exclusively. `nodeIntegration: false` and `contextIsolation: true` are mandatory defaults and must never be overridden.

**Preload API surface (renderer can call):**

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getServices: () => ipcRenderer.invoke('config:get-services'),
  saveServices: (services) => ipcRenderer.invoke('config:save-services', services),

  // Window management
  activateService: (id: string) => ipcRenderer.send('view:activate', id),

  // Update
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', () => cb()),
  installUpdate: () => ipcRenderer.send('update:install'),

  // Notifications / badges
  onBadgeUpdate: (cb) => ipcRenderer.on('badge-update', (_, data) => cb(data)),

  // Audio
  playSound: (path: string) => ipcRenderer.invoke('audio:play', path),
})
```

**Never expose raw `ipcRenderer` to the renderer.** Wrap every handler to strip the `IpcRendererEvent` argument (security best practice — prevents renderer from accessing the ipcRenderer instance via the event object).

### Security Baseline

All BrowserWindows and WebContentsViews must be created with:

```typescript
webPreferences: {
  nodeIntegration: false,        // mandatory
  contextIsolation: true,        // mandatory (default in Electron 12+)
  sandbox: true,                 // enable for renderer shell
  webSecurity: true,             // never disable
  allowRunningInsecureContent: false,
  partition: 'persist:service-name',  // per-service for chat views
}
```

**Note on `sandbox: true`:** The main shell renderer (React UI) should run sandboxed. Service WebContentsViews also get `sandbox: true` — they are loading third-party web apps and should have maximum isolation. When `sandbox: true`, preload scripts are also sandboxed, which is correct since they only use `contextBridge` and `ipcRenderer`.

**CSP for shell renderer:** Apply via `session.defaultSession.webRequest.onHeadersReceived` for the local file:// renderer. Example: `default-src 'self'; script-src 'self'; connect-src https://accounts.google.com https://oauth2.googleapis.com`.

**Permission handler per service session:** Each service session should have a `setPermissionRequestHandler` that allows `media` (camera/mic for video calls), `notifications` (suppress — Electron handles these), and `clipboard-read/write`. Deny `geolocation` and `display-capture` unless required.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| WebView approach | WebContentsView | `<webview>` tag | Deprecated API path; `webviewTag` option discouraged; less control over session; security footguns |
| WebView approach | WebContentsView | BrowserView | Deprecated since Electron 30; actively being removed |
| Build tooling | electron-vite | electron-forge | electron-forge uses Squirrel.Windows on Windows (deprecated); less flexible NSIS config; electron-vite has better HMR; forge Vite plugin is secondary to electron-vite's native support |
| State | Zustand | Redux Toolkit | RTK adds ~50KB, action/reducer boilerplate, and a Provider wrapper for a domain that has ~5 top-level state slices; overkill |
| Styling | Tailwind CSS | styled-components / Emotion | CSS-in-JS has runtime overhead; Tailwind 4 generates pure CSS at build time; dark mode via `class` strategy pairs well with a global theme store |
| Config persistence | electron-store | SQLite (better-sqlite3) | SQLite is correct for relational data; app config is a flat/nested JSON object; electron-store covers the use case at 1/10th the complexity |
| OAuth | Manual PKCE | electron-google-oauth2 | Library abandoned (last release 2021); does not implement current Google OAuth guidance for native apps; unmaintained |
| Notifications | Electron Notification | node-notifier | Shells out to external exe; less Windows 11 fidelity; no `toastXml` support |
| Installer | NSIS | Squirrel.Windows | Squirrel deprecated in electron-builder; not actively maintained upstream; NSIS is electron-builder's current default |

---

## Project Scaffold Command

```bash
npm create @quick-start/electron@latest gradd -- --template react-ts
cd gradd
npm install
npm install zustand electron-store
npm install -D electron-builder
```

This scaffolds: `src/main/`, `src/preload/`, `src/renderer/` with electron-vite config, TypeScript, React, and Vite. Add Tailwind 4 per its installation docs after scaffolding.

---

## Sources

- Electron WebContentsView docs: https://www.electronjs.org/docs/latest/api/web-contents-view (HIGH — official)
- BrowserView deprecation / WebContentsView migration: https://www.electronjs.org/blog/migrate-to-webcontentsview (HIGH — official blog)
- Electron 42.4.1 release: https://releases.electronjs.org/ (HIGH — official)
- electron-store README: https://github.com/sindresorhus/electron-store (HIGH — Context7 verified)
- electron-vite docs: https://electron-vite.org/guide (HIGH — Context7 verified)
- electron-builder NSIS: https://www.electron.build/nsis.html (HIGH — official)
- electron-builder auto-update: https://www.electron.build/auto-update.html (HIGH — Context7 verified)
- Google OAuth2 native app guide: https://developers.google.com/identity/protocols/oauth2/native-app (HIGH — official)
- Electron security tutorial: https://www.electronjs.org/docs/latest/tutorial/security (HIGH — official)
- Electron session API: https://www.electronjs.org/docs/latest/api/session (HIGH — official)
- Electron Notification API: https://www.electronjs.org/docs/latest/api/notification (HIGH — Context7 verified)
- Windows EV code signing requirement: https://www.electronjs.org/docs/latest/tutorial/code-signing (HIGH — official)
- Electron sandbox tutorial: https://www.electronjs.org/docs/latest/tutorial/sandbox (HIGH — Context7 verified)
