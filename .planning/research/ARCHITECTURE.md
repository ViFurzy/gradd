# Architecture Patterns: Electron Chat Aggregator

**Project:** Gradd
**Researched:** 2026-06-17
**Confidence:** HIGH (Electron APIs verified via Context7 + official docs; patterns cross-referenced against Franz/Ferdi open-source implementations)

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ AppLifecycle │  │ WindowMgr    │  │ ServiceRegistry          │  │
│  │ - app ready  │  │ - BaseWindow │  │ - service[] map          │  │
│  │ - quit logic │  │ - tray icon  │  │ - session partitions     │  │
│  │ - DND sched  │  │ - win state  │  │ - badge state            │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────────────┘  │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐    │
│  │ BaseWindow (single app window)                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ contentView (root View)                              │  │    │
│  │  │  ┌─────────────────────────────────────────────────┐│  │    │
│  │  │  │ Shell WebContentsView (React renderer)          ││  │    │
│  │  │  │  - sidebar / tab bar UI                         ││  │    │
│  │  │  │  - settings panels                              ││  │    │
│  │  │  │  - service list, badge overlays                 ││  │    │
│  │  │  └─────────────────────────────────────────────────┘│  │    │
│  │  │  ┌─────────────────────────────────────────────────┐│  │    │
│  │  │  │ Service WebContentsView [N] (per service)       ││  │    │
│  │  │  │  - loads service URL (WhatsApp, Slack, etc.)    ││  │    │
│  │  │  │  - partition: "persist:service-<id>"            ││  │    │
│  │  │  │  - preload: service-bridge.js                   ││  │    │
│  │  │  │  - only ONE visible at a time                   ││  │    │
│  │  │  └─────────────────────────────────────────────────┘│  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ IPCBus       │  │ AuthManager  │  │ ConfigStore              │  │
│  │ ipcMain      │  │ safeStorage  │  │ electron-store (local)   │  │
│  │ handlers     │  │ OAuth PKCE   │  │ Firestore (cloud sync)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         ▲  IPC (ipcMain/ipcRenderer)
         │  one channel per concern
         │
┌────────┴────────────────────────────────────────────────────────────┐
│  PRELOAD SCRIPTS (Isolated World — run in each WebContentsView)     │
│                                                                     │
│  shell-preload.js                  service-bridge.js                │
│  - exposes electronAPI to React    - overrides window.Notification  │
│  - navigate, openExternal          - MutationObserver on title/DOM  │
│  - config read/write               - ipcRenderer.send badge-update  │
│  - auth trigger                    - ipcRenderer.send notify        │
└─────────────────────────────────────────────────────────────────────┘
         ▲  contextBridge (no nodeIntegration)
         │
┌────────┴────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS — Shell (React)                                   │
│                                                                     │
│  - SidebarLayout | TabLayout (user preference toggle)               │
│  - ServiceIcon w/ badge overlay per service                         │
│  - Settings panel (sound, DND, Google sync)                         │
│  - Auth flow UI (Google OAuth trigger → shows result)               │
│  - Receives badge-update events via window.electronAPI              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Main Process vs Renderer Process: Responsibilities

### Main Process owns exclusively

- Creating and destroying `WebContentsView` instances (service views and shell view)
- `BaseWindow` lifecycle (show, hide, minimize, close-to-tray)
- `Tray` icon management and context menu
- `app.setOverlayIcon()` for taskbar badge (Windows)
- `session.fromPartition()` — creating isolated sessions per service
- `safeStorage.encryptStringAsync()` / `decryptStringAsync()` — OAuth token vault
- `electron-store` reads and writes (main process owns the store; renderer requests via IPC)
- Firestore client (Node.js gRPC-based — runs in main, not renderer)
- `Notification` constructor (native OS notifications fired from main after preload intercept)
- DND schedule timer (`setTimeout`/`setInterval` in main)
- Auto-updater (`electron-updater`)

### Renderer Process (React Shell) owns

- All visible UI: sidebar, tab bar, badge counters, settings panels
- User interaction events that trigger IPC calls to main
- Displaying auth state (logged in / out indicator)
- Layout preference state (sidebar vs top tabs) — stored in electron-store via IPC

### Preload Scripts bridge the gap

Two distinct preload scripts are needed:

**`shell-preload.js`** — attached to the React shell WebContentsView. Exposes a typed `window.electronAPI` surface via `contextBridge`. Does not access service content.

**`service-bridge.js`** — attached to every service WebContentsView. Runs in the same Renderer world as the embedded web app (e.g., WhatsApp Web). Can override globals, install MutationObservers, intercept the Notification API.

---

## Managing N WebContentsViews

### Current API (Electron 29+)

`BrowserView` is deprecated since Electron 29. Use `WebContentsView` + `BaseWindow`:

```javascript
// Main process
const { BaseWindow, WebContentsView, session } = require('electron')

const win = new BaseWindow({ width: 1200, height: 800 })

function createServiceView(serviceId, url) {
  const partition = `persist:service-${serviceId}`
  const ses = session.fromPartition(partition)

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'service-bridge.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,  // keep timers alive when hidden
    }
  })
  view.webContents.loadURL(url)
  win.contentView.addChildView(view)
  view.setVisible(false)  // hidden until user selects it
  return view
}
```

### Lifecycle: Add / Show / Hide / Destroy

```
ADD:     createServiceView() → addChildView() → setVisible(false)
SHOW:    activeView.setVisible(false) → nextView.setVisible(true) → setBounds(contentArea)
HIDE:    view.setVisible(false)  [WebContents stays alive, sessions persist]
DESTROY: win.contentView.removeChildView(view) → view.webContents.close()
```

- `setVisible(false)` keeps the WebContents process alive — sessions and DOM state are preserved. This is correct for chat apps (you don't want to re-authenticate every tab switch).
- Only destroy a view when the user explicitly removes a service from their list.
- `backgroundThrottling: false` is required so that message polling and service worker timers keep running in hidden views. Without this, services stop receiving messages when not active.

### Bounds Management

WebContentsViews do not auto-resize. You must handle `resize` on the BaseWindow and recalculate bounds:

```javascript
win.on('resize', () => {
  const [w, h] = win.getContentSize()
  const sidebarW = 72  // fixed sidebar width
  activeServiceView.setBounds({ x: sidebarW, y: 0, width: w - sidebarW, height: h })
  shellView.setBounds({ x: 0, y: 0, width: w, height: h })
})
```

Shell view covers the full window at z-index below service views (shell renders sidebar/tabs as DOM overlay). Service views are positioned in the content area at a higher layer.

### Focus Management

Service WebContentsViews do not automatically receive keyboard focus when shown. You must call:

```javascript
view.webContents.focus()
```

after calling `setVisible(true)`. Without this, keyboard shortcuts in the embedded service (e.g., Slack's `K` for search) will not work.

---

## Session Partition Strategy

### Naming Convention

```
persist:service-<serviceId>
```

Where `serviceId` is a stable UUID assigned when the user adds a service. Examples:

```
persist:service-3f7a1c9e-messenger
persist:service-9b2d4e1a-whatsapp
persist:service-c5f8a3d2-slack-work
```

Using a UUID prefix rather than just the service type allows multiple accounts of the same service (two Slack workspaces get separate partitions and therefore separate cookies/IndexedDB/localStorage).

### Rules

- Never share a partition between two service views. Shared partitions share cookies — logging into Gmail in one view would log in the other.
- Never use the app's default session for service views. The default session is used by the shell renderer.
- The shell WebContentsView uses the default session (no partition) — it doesn't need isolation and should share the app's electron-store-backed config.

### Storage Location

Persistent partitions store their data at:
```
%APPDATA%\gradd\Partitions\persist_service-<id>\
```

This is automatically managed by Electron. Each partition gets its own:
- Cookies
- localStorage / IndexedDB
- Cache
- Service Worker registrations

---

## Unread Count Interception Architecture

### Three complementary strategies (use all three per service)

**Strategy 1: window.Notification override (most reliable)**

In `service-bridge.js` (preload), before the page scripts run:

```javascript
// service-bridge.js runs in Renderer world of the service WebContentsView
const { ipcRenderer } = require('electron')
const OriginalNotification = window.Notification

window.Notification = function(title, options) {
  // Count every notification as +1 unread, let main process track
  ipcRenderer.send('service:notification', {
    serviceId: process.env.SERVICE_ID,  // injected at view creation
    title,
    body: options?.body,
    tag: options?.tag,
  })
  return new OriginalNotification(title, options)
}
// Copy static properties
Object.assign(window.Notification, OriginalNotification)
window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification)
```

**Strategy 2: document.title MutationObserver**

Many services encode unread counts in the document title (e.g., `(3) WhatsApp`, `Slack | 5 new messages`):

```javascript
// Also in service-bridge.js
const parseUnreadFromTitle = (title) => {
  const match = title.match(/^\((\d+)\)/)
  return match ? parseInt(match[1]) : 0
}

const observer = new MutationObserver(() => {
  const count = parseUnreadFromTitle(document.title)
  ipcRenderer.send('service:badge-update', { serviceId: SERVICE_ID, count })
})
observer.observe(document.querySelector('title'), { childList: true })
```

**Strategy 3: DOM element polling (Franz/Ferdi pattern)**

For services that render unread counts in specific DOM nodes (WhatsApp, Messenger) but don't reflect them in the title:

```javascript
// Configured per-service in a recipe system (see FEATURES.md)
Franz.loop(() => {
  const el = document.querySelector('[data-testid="conversation-badge"]')
  const count = el ? parseInt(el.textContent) : 0
  ipcRenderer.send('service:badge-update', { serviceId: SERVICE_ID, count })
})
```

### IPC Flow

```
service-bridge.js (renderer world of service view)
  → ipcRenderer.send('service:badge-update', { serviceId, count })
  → ipcRenderer.send('service:notification', { serviceId, title, body })

main process ipcMain.on('service:badge-update')
  → ServiceRegistry.updateBadge(serviceId, count)
  → aggregates total = sum of all badges
  → win.setOverlayIcon(renderBadgeImage(total), '')  [taskbar badge]
  → tray.setImage(renderTrayIcon(serviceBadges))      [tray icon]
  → shellView.webContents.send('badges-updated', badgeMap)  [sidebar counters]

main process ipcMain.on('service:notification')
  → if DND mode: suppress
  → else: new Notification({ title: serviceTitle, body })
  → play custom sound for this service (Audio in shell renderer)
```

---

## IPC Architecture

### Channel Naming Convention

```
service:badge-update      service view → main
service:notification      service view → main
shell:navigate            shell renderer → main
shell:service-add         shell renderer → main
shell:service-remove      shell renderer → main
shell:config-write        shell renderer → main
shell:config-read         shell renderer → main (returns via invoke)
main:badges-updated       main → shell renderer (push)
main:auth-state           main → shell renderer (push)
main:update-available     main → shell renderer (push)
```

### IPC Pattern

Use `ipcMain.handle` + `ipcRenderer.invoke` for request/response (config reads, auth). Use `ipcMain.on` + `ipcRenderer.send` for fire-and-forget events (badge updates, notification intercepts). Use `webContents.send` for main-pushed events to shell.

Never expose raw `ipcRenderer` through `contextBridge`. Expose only specific typed functions:

```javascript
// shell-preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('shell:config-read'),
  setConfig: (data) => ipcRenderer.invoke('shell:config-write', data),
  addService: (service) => ipcRenderer.invoke('shell:service-add', service),
  removeService: (id) => ipcRenderer.invoke('shell:service-remove', id),
  onBadgesUpdated: (cb) => ipcRenderer.on('main:badges-updated', (_, map) => cb(map)),
  onAuthState: (cb) => ipcRenderer.on('main:auth-state', (_, state) => cb(state)),
  onUpdateAvailable: (cb) => ipcRenderer.on('main:update-available', (_, info) => cb(info)),
  triggerGoogleAuth: () => ipcRenderer.invoke('shell:google-auth'),
})
```

---

## Google OAuth Token Storage

### Flow (PKCE, no client secret required for installed apps)

1. User clicks "Sign in with Google" in shell React UI
2. Shell sends `ipcRenderer.invoke('shell:google-auth')` to main
3. Main opens a temporary `BrowserWindow` loading Google's OAuth consent page with PKCE code challenge
4. Main registers a custom protocol handler or `will-redirect` listener to capture the authorization code from the redirect URI
5. Main exchanges the code for `access_token` + `refresh_token`
6. Main stores `refresh_token` via `safeStorage.encryptStringAsync(refreshToken)`, writes encrypted buffer to `electron-store` as a base64 string
7. Main closes the temp OAuth window
8. On subsequent app launches, main reads encrypted buffer from store, calls `safeStorage.decryptStringAsync()`, uses refresh token to obtain a new access token

### Windows DPAPI Guarantee

`safeStorage` on Windows uses DPAPI. This means:
- Only the same Windows user account can decrypt the token
- Other processes running as the same user can also decrypt it (DPAPI limitation — acceptable for v1)
- Tokens are NOT accessible to other Windows user accounts

**Do not** store the raw refresh token in `electron-store` without encryption. `electron-store` writes plaintext JSON to `%APPDATA%\gradd\config.json`.

### Library

Use `@getstation/electron-google-oauth2` (npm) rather than hand-rolling the PKCE flow. It handles code verifier generation, redirect interception, and token refresh. Wraps the token storage pattern described above.

---

## Config Sync Architecture (Local + Cloud)

### Source of Truth

```
Local (authoritative on current device)
  electron-store → %APPDATA%\gradd\config.json

Cloud (sync layer, not authoritative)
  Firestore → users/{uid}/config document
```

### What gets synced

```json
{
  "services": [
    { "id": "uuid", "type": "whatsapp", "label": "Personal", "order": 0 }
  ],
  "layout": "sidebar",  // "sidebar" | "tabs"
  "groups": [
    { "id": "uuid", "name": "Work", "serviceIds": ["uuid1", "uuid2"] }
  ],
  "sounds": {
    "service-uuid": "notification-1.mp3"
  },
  "dnd": {
    "enabled": false,
    "schedule": { "start": "22:00", "end": "08:00" }
  }
}
```

**Session credentials are never synced** — they are local-only (service partition data stays in Electron's user data directory).

### Sync Strategy: Last-Write-Wins with Merge

On app start:
1. Load local config from electron-store
2. If Google auth token present, fetch Firestore config
3. Merge: if Firestore timestamp > local timestamp, overwrite local; else keep local
4. Save merged config locally

On config change:
1. Write to local electron-store immediately (synchronous UX)
2. Debounce 2s, then write to Firestore (async, best-effort)

On Firestore write failure: silently queue for retry on next app focus. Never block local UX on cloud sync.

### Firestore in Electron

The Firestore Node.js SDK uses gRPC, which works in Electron's main process without rebuilding. Do NOT use the web/browser Firestore SDK in main — it makes HTTP requests but lacks offline persistence and is designed for browser contexts. Use `firebase-admin` or `@google-cloud/firestore` in main process.

---

## Notification Sound Architecture

### Recommendation: Preloaded Audio in Shell Renderer

Play notification sounds in the Shell Renderer process using the Web Audio API, not the main process. Reasons:
- Web Audio API is not available in main (Node.js)
- `shell.beep()` only plays the system beep — no custom sounds
- Native `Notification({ sound })` supports custom sounds on macOS only, not Windows

### Pattern

```
Main receives 'service:notification' IPC event
  → looks up configured sound for serviceId
  → sends 'main:play-sound' to shellView.webContents with { soundFile }

Shell Renderer window.electronAPI.onPlaySound callback
  → new Audio(`app://sounds/${soundFile}`).play()
```

Sound files ship bundled in `resources/sounds/` inside the ASAR. Register a custom `app://` protocol in main to serve them.

Preload the 4-5 bundled sound files as Audio objects at startup to avoid first-play latency:

```javascript
// In shell renderer, on startup
const SOUNDS = {}
for (const name of BUNDLED_SOUNDS) {
  SOUNDS[name] = new Audio(`app://sounds/${name}`)
  SOUNDS[name].load()
}
```

### DND Suppression

DND state lives in main process. When DND is active, main suppresses both the native `Notification` firing and the `main:play-sound` IPC event. Shell renderer has no role in DND logic.

---

## Tray Icon Update Mechanism

### Windows constraints

Windows does not support text on the tray icon (unlike macOS dock badge). Two approaches:

1. **Taskbar overlay icon** (`win.setOverlayIcon(nativeImage, description)`) — shows a small badge overlaid on the taskbar button. Supports numbers drawn onto a NativeImage canvas. Best for total unread count.

2. **Tray icon** — 16x16 or 32x32 image in system tray. For Gradd, show a dot indicator when any unread count > 0, and update the tooltip with per-service counts.

### Dynamic Icon Generation

Draw badge images in the Shell Renderer (Canvas API available) and send back to main via IPC:

```
Shell renderer:
  canvas.getContext('2d') → draw circle + number → canvas.toDataURL()
  ipcRenderer.send('shell:badge-image', dataURL)

Main:
  nativeImage.createFromDataURL(dataURL)
  win.setOverlayIcon(image, `${total} unread messages`)
```

This pattern is confirmed by the Electron issue tracker (#7440) and production apps (Rocket.Chat Electron). The render-in-renderer approach is necessary because Canvas API is unavailable in main.

Alternatively, use the `electron-taskbar-badge` npm package which wraps this pattern.

---

## Window State Persistence

### Library

Use `electron-window-state` (npm: `electron-window-state`). It stores `x`, `y`, `width`, `height`, and `isMaximized` in `window-state.json` in the userData directory. It registers `resize` and `move` listeners automatically and saves on close.

```javascript
const windowState = windowStateKeeper({ defaultWidth: 1200, defaultHeight: 800 })
const win = new BaseWindow({
  x: windowState.x, y: windowState.y,
  width: windowState.width, height: windowState.height,
})
windowState.manage(win)  // registers listeners
```

On first launch (no saved state), the window opens centered at the default size.

**Critical**: Call `win.getNormalBounds()` (not `win.getBounds()`) before saving, so that maximized windows restore to their pre-maximized size. `electron-window-state` handles this correctly.

---

## Single-Window Architecture (Confirmed)

Use a single `BaseWindow`. Do NOT use multiple `BrowserWindow` instances for the main chat interface.

**Rationale:**
- Each additional `BrowserWindow` adds 150-250MB RAM overhead
- Multi-window sync (badge counts, DND state, active service) requires Broadcast Channel or additional IPC plumbing
- Rambox and Franz both use single-window architectures for exactly this reason
- The layout flexibility requirement (sidebar vs top-tabs) is a CSS/React layout concern, not a window concern

**Where a second window is appropriate:**
- Settings window (optional, can also be a panel in the main window)
- Detached service window (future feature, not v1)
- The transient OAuth popup window (created for auth flow, immediately destroyed)

---

## Build Order Implications

Based on component dependencies, the correct build sequence is:

### Phase 1: Shell Foundation (no services yet)
Build the BaseWindow + shell WebContentsView + React shell with static sidebar. No service views. Establish the IPC bus with typed channels. Implement window state persistence.

Dependencies unlocked for later phases: window management, IPC architecture, React shell rendering.

### Phase 2: Service View Management
Add WebContentsView per service with session partitioning. Implement show/hide/focus/bounds logic. Load real service URLs. Verify session persistence on restart.

Depends on: Phase 1 (IPC bus, window).

### Phase 3: Unread Count + Notification Pipeline
Implement `service-bridge.js` preload. Wire `window.Notification` override + title MutationObserver. Implement badge aggregation in main, tray icon updates, taskbar overlay.

Depends on: Phase 2 (service views must exist before preload can run).

### Phase 4: Notification Sound + DND
Add sound file bundling, custom protocol, shell renderer audio playback. Add DND schedule logic in main. Wire per-service sound config.

Depends on: Phase 3 (notification pipeline must exist to intercept and play sounds).

### Phase 5: Google Auth + Config Sync
Implement PKCE OAuth flow, safeStorage token vault, Firestore sync with local-first merge strategy.

Depends on: Phase 1 (electron-store), Phase 3 (nothing — auth is independent of service views).

### Phase 6: Polish + Auto-Update
Integrate `electron-updater`, finalize tray menu, error recovery for crashed service views.

Depends on: All prior phases.

---

## Anti-Patterns to Avoid

### Using the deprecated BrowserView API
BrowserView is deprecated since Electron 29. New code must use `WebContentsView` + `BaseWindow`. BrowserView removal is planned for a future major version.

### Enabling `nodeIntegration: true` on service views
Service views load untrusted third-party web apps (WhatsApp Web, Messenger, etc.). `nodeIntegration: true` would give those pages full Node.js access — a critical security vulnerability. Always `nodeIntegration: false` + `contextIsolation: true` on service views.

### Exposing raw `ipcRenderer` through contextBridge
`contextBridge.exposeInMainWorld('ipc', ipcRenderer)` exposes all IPC channels to the embedded web app. This allows the web app (or injected scripts) to send arbitrary messages. Only expose named, typed functions.

### Storing OAuth tokens in plaintext electron-store
`electron-store` writes to a plaintext JSON file. The refresh token must be encrypted with `safeStorage` before writing to the store.

### Sharing a session partition between two service views
Two views with the same partition share cookies. This breaks service isolation. Use unique partition IDs per service instance.

### Destroying service views on tab switch
Destroying and recreating the WebContentsView on every tab switch forces the service to reload and re-authenticate. Keep all service views alive (just hidden) and only destroy when the user explicitly removes a service.

### Using the Firestore web SDK in the main process
The web SDK is optimized for browser environments and makes HTTP fetch calls. In Electron's main process (Node.js), use the Node.js Firestore SDK (`@google-cloud/firestore`) which uses gRPC and has proper connection management.

### `backgroundThrottling: true` on service views (the default)
Leaving throttling enabled means hidden service views' timers and polling slow down dramatically. Services stop receiving real-time updates. Set `backgroundThrottling: false` for all service WebContentsViews.

---

## Sources

- Electron WebContentsView migration guide: https://www.electronjs.org/blog/migrate-to-webcontentsview
- Electron session/partition docs: https://www.electronjs.org/docs/latest/api/session
- Electron safeStorage (Windows DPAPI): https://www.electronjs.org/docs/latest/api/safe-storage
- Electron contextBridge patterns: https://www.electronjs.org/docs/latest/api/context-bridge
- Electron tray / setOverlayIcon: https://www.electronjs.org/docs/latest/api/tray
- Electron window backgroundThrottling: https://www.electronjs.org/docs/latest/api/web-contents
- Franz service recipe integration pattern: https://github.com/meetfranz/plugins/blob/master/docs/integration.md
- electron-window-state library: https://github.com/mawie81/electron-window-state
- Dynamic taskbar badge in Electron: https://dev.to/randomengy/dynamic-generation-of-task-bar-overlay-icons-in-electron-27in
- Google OAuth PKCE for desktop apps: https://developers.google.com/identity/protocols/oauth2/native-app
- electron-google-oauth2: https://github.com/getstation/electron-google-oauth2
- Electron multi-window performance analysis: https://blog.scottlogic.com/2019/05/21/analysing-electron-performance-chromium-tracing.html
