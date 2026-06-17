# Research Summary: Gradd Desktop Chat Aggregator

**Synthesized:** 2026-06-17
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md

---

## Executive Summary

Gradd is a Windows-only Electron desktop app that embeds 6 web-based messaging services (Messenger, WhatsApp, Telegram, Slack, Instagram Direct, Gadu-Gadu) into a single window, with Google OAuth-backed config sync and a dark-first minimal UI. The architecture is well-understood: Rambox, Franz, and Ferdi are open-source predecessors using the same technical approach, giving this project unusually high research confidence. The core pattern is one BaseWindow containing N WebContentsView instances, a React shell renderer, and a main process that owns all system-level concerns.

Signal has been dropped from v1 scope because Signal has no web client -- a hard architectural constraint from Signal's own security design. Gadu-Gadu has a web client (web.gadu-gadu.pl) but its embedding viability is unconfirmed and requires a manual spike before committing to v1 scope. The remaining 5 services (Messenger, WhatsApp, Telegram, Slack, Instagram) are confirmed embeddable, with WhatsApp and Instagram requiring Chrome user-agent spoofing to avoid service rejection.

The primary risks are memory pressure from 6 simultaneous renderer processes (~2 GB total), the Windows-specific notification setup ritual (app.setAppUserModelId before any window is created), and Google OAuth failing if naively attempted inside an embedded WebView (must use system browser + PKCE loopback). All three risks have well-documented mitigations. The differentiation opportunity is primarily in execution quality: accurate unread badges, reliable notifications, instant service switching, and a UI that is not visually dated.

---

## Recommended Stack

| Technology | Version | Role |
|------------|---------|------|
| Electron | 42.x (pin latest stable) | Desktop runtime; Chromium per-partition session isolation |
| Node.js | 24.x (bundled with Electron 42) | Main process runtime |
| TypeScript | 5.x | End-to-end type safety across main/preload/renderer IPC surface |
| electron-vite | 3.x | Build orchestrator; HMR for renderer; hot reload for main/preload |
| React | 19.x | Shell renderer UI (sidebar, settings, badge overlays) |
| Tailwind CSS | 4.x | Dark-first styling; zero-runtime CSS |
| Zustand | 5.x | Client state (active service, badge map, layout preference) |
| electron-store | 10.x (pure ESM) | Local config persistence with schema validation |
| electron-builder | 25.x | Packaging; NSIS installer for Windows |
| electron-updater | 6.x | Auto-update (notify only, user-triggered install) |
| electron-window-state | latest | Window position/size persistence |

**Critical version note:** electron-store v10 is pure ESM. The entire main process must use ESM ("type": "module" in package.json). Do not mix CJS require() in main process entry points.

**Scaffold command:** `npm create @quick-start/electron@latest gradd -- --template react-ts`

---

## Table Stakes Features (Must Ship in v1)

These are features whose absence makes the product feel incomplete. Users will not recommend an app missing any of these.

| Feature | Why Critical | Key Technical Note |
|---------|-------------|-------------------|
| 6 services embedded + session persistence | Core product premise | `persist:` prefix on WebContentsView partitions |
| Per-service unread badge on sidebar/tabs | The point of aggregation | `page-title-updated` + `window.Notification` intercept in service-bridge preload |
| Taskbar overlay badge (total unread) | Windows standard for chat apps | `win.setOverlayIcon()` -- NOT `app.badgeCount` (no-op on Windows) |
| System tray icon + close-to-tray | De facto standard for chat apps | Intercept `close` event; keep tray; double-click to restore |
| DND mode with schedule | Distraction management | Main process timer; blocks both Notification API and sound IPC |
| Custom sound per service | Baked into requirements | Web Audio API in shell renderer; sounds bundled in ASAR under `app://sounds/` |
| Named service groups (chat sets) | Explicitly required in PROJECT.md | Filter sidebar by active group; persisted in electron-store |
| Google sync for config | Explicitly required in PROJECT.md | PKCE + loopback in system browser; Firestore Node.js SDK in main |
| Both layout modes (sidebar icons / top tabs) | Explicitly required in PROJECT.md | Two React layout components; preference stored in electron-store |
| Dark-first UI | Explicitly required in PROJECT.md | Tailwind class-based dark strategy; Linear/Notion aesthetic |
| Launch at startup | Users expect always there | `app.setLoginItemSettings` |
| Keyboard shortcuts: Ctrl+1-9, Ctrl+Tab, quick switcher | Power user baseline | `globalShortcut` API -- not DOM listeners (stolen by service webviews) |
| In-app update notification | User-controlled install | `electron-updater` + custom renderer prompt |

---

## Top 5 Pitfalls and Mitigations

### Pitfall 1: Google OAuth Blocked in Embedded WebViews (Critical)

**What fails:** Any attempt to open accounts.google.com inside an Electron BrowserWindow/WebContentsView. Google detects the embedded Chromium context and returns `disallowed_useragent` since June 2021.

**Mitigation:** Use `shell.openExternal(authUrl)` to open the consent screen in the default browser. Spin up a temporary `http.createServer` on `localhost:PORT` to capture the auth code. Implement PKCE (code_verifier + SHA256 challenge). Register `http://127.0.0.1` as redirect URI with OAuth client type Desktop app in Google Cloud Console. Store the refresh token encrypted via `safeStorage` (Windows DPAPI). **Blocks Phase 6.**

### Pitfall 2: WhatsApp and Instagram Reject the Electron User Agent (Critical)

**What fails:** Both services detect the `Electron/X.Y.Z` token in the UA string and refuse to load or show degraded UI. WhatsApp also enforces a minimum Chrome version.

**Mitigation:** Call `session.setUserAgent(chromeUA)` on each service session before any `loadURL()`. Use a current Chrome stable UA string that strips the Electron token. Keep a per-service UA map in config. Update UA strings as Chrome versions advance. **Blocks Phase 2.**

### Pitfall 3: Windows Notifications Silent Without AppUserModelID (Critical)

**What fails:** `new Notification(...)` calls in both development and NSIS-packaged builds silently produce nothing if `app.setAppUserModelId()` has not been called before `app.whenReady()`.

**Mitigation:** Call `app.setAppUserModelId('com.gradd.app')` as the very first line in the main process entry, before any window creation. Set `appId` in electron-builder config so NSIS builds inherit it. Validate on a clean Windows install, not just the dev machine. **Blocks Phase 3.**

### Pitfall 4: Session Cookie Bleed Between Services (Critical, Architectural)

**What fails:** If two WebContentsViews share a session partition, their cookies, localStorage, and IndexedDB bleed together. Retrofitting this after sessions are written to disk requires wiping all stored sessions.

**Mitigation:** Assign every service WebContentsView a unique `persist:service-<uuid>-<type>` partition string. Set the session before any `loadURL()`. Verify with `webContents.session.storagePath` that each service points to a distinct directory. Never share partitions even between same-vendor services (Messenger and Instagram). **Blocks Phase 2 architecture.**

### Pitfall 5: Gadu-Gadu Web Client Viability Is Unverified (Scoping Risk)

**What fails:** The GG web client at web.gadu-gadu.pl exists but underwent significant changes under new ownership (Fintecom S.A., 2024-2025). No community precedent exists for embedding it in Electron.

**Mitigation:** Run a manual spike at the start of Phase 2. Open web.gadu-gadu.pl in plain Chromium to verify login and messaging. Then test in a WebContentsView with Electron UA stripped. If broken, drop GG from v1 and treat as post-v1. **Blocks Phase 2 service list finalization.**

---

## Architecture Decision Record

| Decision | Choice | Rationale | Status |
|----------|--------|-----------|--------|
| Desktop runtime | Electron 42.x | Tauri uses OS WebView2; lacks reliable per-partition session persistence for WhatsApp/Telegram QR sessions | Confirmed |
| WebView API | WebContentsView + BaseWindow | BrowserView deprecated since Electron 30; webview tag is legacy with security footguns | Confirmed |
| Window structure | Single BaseWindow | Each additional BrowserWindow adds 150-250 MB RAM; multi-window badge/DND sync requires extra IPC | Confirmed |
| Session isolation | persist:service-UUID-type per view | Prevents cookie bleed; persist: survives restarts; UUID enables multiple accounts of same service type | Confirmed |
| IPC model | contextBridge + preload scripts only | nodeIntegration: false + contextIsolation: true mandatory; expose narrow typed functions, never raw ipcRenderer | Confirmed |
| Two preload scripts | shell-preload.js + service-bridge.js | Shell preload exposes typed window.electronAPI to React; service bridge overrides window.Notification and title MutationObserver | Confirmed |
| Unread count strategy | Three-strategy: Notification intercept + title MutationObserver + DOM polling | Single strategy unreliable across 6 services; all three used together maximize accuracy | Confirmed |
| Taskbar badge | win.setOverlayIcon() with canvas-rendered image | app.badgeCount is a documented no-op on Windows | Confirmed |
| Config persistence | electron-store (local) + Firestore Node.js SDK (cloud) | Flat JSON config fits electron-store; Firestore Node.js SDK (not web SDK) runs in main via gRPC | Confirmed |
| OAuth flow | PKCE + system browser + loopback http.createServer | Google blocks OAuth in embedded Chromium since 2021; loopback is recommended by Google for native apps (RFC 8252) | Confirmed |
| Token storage | safeStorage.encryptStringAsync() then electron-store | Raw refresh token must not exist in plaintext config.json; DPAPI via safeStorage protects at Windows user account level | Confirmed |
| Build tooling | electron-vite + electron-builder NSIS | electron-vite: single config, HMR; NSIS: electron-builder default, Squirrel.Windows deprecated | Confirmed |
| State management | Zustand 5.x | ~5 top-level slices; no Provider wrapper; Redux Toolkit is overkill | Confirmed |
| Signal in v1 | Dropped | No web client exists; hard architectural constraint from Signal's own security design | Confirmed |
| Gadu-Gadu in v1 | Conditional on spike | Web client exists but unverified under new ownership | Pending spike |
| Background throttling | backgroundThrottling: false on all service views | Default slows timers in hidden views; services stop receiving messages when not active | Confirmed |

---

## Open Questions

| Question | Blocks | Recommended Resolution |
|----------|--------|----------------------|
| Does web.gadu-gadu.pl work embedded? | Service list finalization (Phase 2) | Manual spike at start of Phase 2. |
| Which services use Web Push vs WebSocket? | Notification reliability (Phase 3) | Per-service DevTools test before Phase 3. WhatsApp/Telegram/Messenger expected WebSocket. |
| Does Instagram Direct work reliably embedded? | Instagram integration (Phase 2) | Manual test with Chrome UA override. |
| EV code signing timeline? | Distribution (Phase 7) | 1-2 week lead time. Start at Phase 4-5. |
| Gadu-Gadu: v1 commitment or stretch goal? | Roadmap scoping | Stretch goal: spike passes in Phase 2 = ships; spike fails = post-v1. |

---

## Suggested Phase Structure

The ARCHITECTURE.md confirms a dependency-ordered build sequence. The following phases reflect those dependencies plus the Signal removal and Gadu-Gadu conditional scope.

### Phase 1: Shell Foundation
Delivers: Working Electron app with React shell, sidebar/tab layout toggle, IPC bus, window state persistence, tray icon, close-to-tray, launch at startup. No services yet.
Why first: Everything depends on the window, shell renderer, and IPC architecture. Preload scripts and IPC channel naming locked here.
Key risk: Set nodeIntegration: false, contextIsolation: true, sandbox: true, and call setAppUserModelId from day one.
Research flag: Standard patterns. No deep research needed.

### Phase 2: Service Embedding + Session Isolation
Delivers: All 5 confirmed services embedded with persisted sessions. Gadu-Gadu spike runs here; GG added to scope if spike passes.
Why second: Service views depend on Phase 1. Establishes partition naming, Chrome UA override map, bounds management, and view lifecycle.
Key risk: UA and session partition must be set before loadURL(). webContents.focus() must be called after setVisible(true). backgroundThrottling: false on all service views.
Research flag: Confirmed for 5 services. Instagram Direct and Gadu-Gadu need manual embedding validation (spikes within this phase).

### Phase 3: Unread Badge + Notification Pipeline
Delivers: Unread badge on sidebar icons, taskbar overlay badge, tray tooltip with per-service counts, Windows OS notifications.
Why third: Requires service views (Phase 2). Most service-specific phase; budget per-service debugging time.
Key risk: Use globalShortcut/accelerator for all app shortcuts. Test notifications on a clean Windows account.
Research flag: window.Notification intercept is well-documented. Per-service notification mechanism audit needed before Phase 3 starts.

### Phase 4: Notification Sounds + DND
Delivers: Custom sound per service, DND toggle, DND schedule (quiet hours).
Why fourth: Requires notification pipeline (Phase 3) before adding sound and DND suppression on top.
Key risk: Audio plays in shell renderer (Web Audio API), not in main (Node.js). DND logic lives entirely in main.
Research flag: Standard patterns. No deep research needed.

### Phase 5: Named Groups + Keyboard Shortcuts + UX Polish
Delivers: Named service groups, all keyboard shortcuts, service-level zoom, drag-to-reorder sidebar, hibernation.
Why fifth: Builds on working service switching (Phases 2-3). Hibernation badge persistence needs design before implementation.
Key risk: Hibernation must not silence notifications. Badge count cached in ServiceRegistry before view destruction.
Research flag: Hibernation + badge persistence interaction warrants a short design spike before implementation.

### Phase 6: Google Auth + Config Sync
Delivers: Google OAuth sign-in (PKCE + loopback), Firestore config sync (last-write-wins, local-first merge), refresh token vault via safeStorage.
Why sixth: Config schema is stable after phases 2-5. Sync payload finalized once all config fields exist.
Key risk: Never open Google OAuth in an embedded WebView. Never write refresh token without safeStorage encryption. Use Firestore Node.js SDK in main, not the browser SDK.
Research flag: PKCE + loopback well-documented. Firestore merge strategy needs one design decision (timestamp field) before starting.

### Phase 7: Packaging + Distribution
Delivers: NSIS installer, portable EXE, electron-updater with in-app notification, code signing.
Why last: Packaging requires all features complete. EV certificate acquisition should start during Phase 4-5.
Key risk: perMachine: false to avoid UAC prompts on update. Test on clean Windows VM. Squirrel.Windows is deprecated -- NSIS only.
Research flag: Standard patterns. EV certificate lead time (1-2 weeks) is the only timeline risk -- handle proactively.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Core Electron stack (WebContentsView, session partitions, electron-vite) | HIGH | Official Electron docs; Context7-verified; open-source precedents (Franz, Ferdi) |
| Unread badge interception strategies | HIGH | Franz recipe system patterns; confirmed via official Electron page-title-updated event docs |
| Security model (contextIsolation, preload, sandboxing) | HIGH | Official Electron security tutorial; known CVEs confirm the risks |
| Windows notification setup (AppUserModelID, setOverlayIcon) | HIGH | Official Electron docs; confirmed behavior |
| Google OAuth PKCE + loopback | HIGH | Official Google developer docs (RFC 8252) |
| WhatsApp / Instagram UA override | HIGH | Community-confirmed across Nativefier, Rambox, Franz issue trackers |
| Gadu-Gadu embedding | LOW | Web client exists but no Electron-specific community precedent; ownership changed 2024-2025 |
| Per-service notification mechanism (WebSocket vs Web Push) | MEDIUM | WhatsApp/Telegram/Messenger expected WebSocket but not verified for current service versions |
| Instagram Direct web embedding reliability | MEDIUM | Accessible from web but Meta embedded-browser policies can change |
| EV code signing SmartScreen behavior | MEDIUM | Policy changed March 2024; new EV certs no longer instantly suppress SmartScreen |

Overall: HIGH confidence on the core technical approach. The architecture is well-proven by open-source predecessors. The main unknowns are service-specific (GG viability, Instagram reliability, per-service notification mechanisms) and are resolved with targeted spikes in Phases 2-3.

---

## Sources (Aggregated)

HIGH confidence (official docs):
- Electron WebContentsView migration guide: https://www.electronjs.org/blog/migrate-to-webcontentsview
- Electron session API: https://www.electronjs.org/docs/latest/api/session
- Electron security tutorial: https://www.electronjs.org/docs/latest/tutorial/security
- Google OAuth2 native app guide: https://developers.google.com/identity/protocols/oauth2/native-app
- electron-store: https://github.com/sindresorhus/electron-store
- electron-vite docs: https://electron-vite.org/guide
- electron-builder: https://www.electron.build/

HIGH confidence (community/cross-referenced):
- Franz service recipe integration: https://github.com/meetfranz/plugins/blob/master/docs/integration.md
- WhatsApp UA override: https://github.com/nativefier/nativefier/issues/1112
- Google OAuth WebView block: https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/

MEDIUM confidence (community reports, policies in flux):
- EV code signing SmartScreen behavior post-March 2024
- Gadu-Gadu web client status: https://webtechsurvey.com/website/web.gadu-gadu.pl