# Domain Pitfalls: Electron Desktop Chat Aggregator

**Domain:** Multi-service Electron chat aggregator (Windows)
**Researched:** 2026-06-17
**Confidence:** HIGH for most areas (verified against official Electron docs, GitHub issues, Google developer blog)

---

## Critical Pitfalls

Mistakes that cause rewrites, blocked service access, or security vulnerabilities.

---

### Pitfall 1: Google Blocks OAuth in Embedded WebViews

**What goes wrong:** Opening the Google OAuth flow inside an Electron BrowserWindow or WebContentsView triggers Google's embedded-webview detection and returns an "access blocked" error. Google banned embedded webview OAuth for CEF/Electron apps effective June 30, 2021. Any attempt to load `accounts.google.com` inside the app fails.

**Why it happens:** Google's policy prohibits OAuth in embedded browsers because they allow app developers to intercept credentials, inject scripts, and read session cookies. Electron's Chromium context is detected via the `User-Agent` header (which includes "Electron") and request headers.

**Consequences:** The Google sign-in flow for config sync completely fails if implemented naively. This is a hard wall, not a workaround-able quirk.

**Prevention:**
- Use `shell.openExternal(authUrl)` to open the consent screen in the user's system browser (Chrome, Edge, etc.).
- Spin up a temporary `http.createServer` on `localhost:PORT` to receive the redirect with the authorization code.
- Implement PKCE (RFC 8252) — generate `code_verifier` and `code_challenge` before launching the browser. Send the challenge in the auth URL, send the verifier when exchanging the code for tokens.
- Register `http://localhost` (or `http://127.0.0.1`) as the redirect URI in Google Cloud Console under "Desktop app" OAuth client type.
- Store the refresh token in `electron-store` (encrypted) and use it to silently obtain new access tokens without user interaction on subsequent launches.

**Warning signs:**
- `error=disallowed_useragent` in the OAuth redirect URL
- Google sign-in page showing "This browser or app may not be secure" message

**Phase:** Address in Phase implementing Google sync. Do not attempt inline WebView OAuth.

**Sources:** [Google Developers Blog - OAuth WebView policy](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/) | [Auth0 blog](https://auth0.com/blog/google-blocks-oauth-requests-from-embedded-browsers/) | RFC 8252

---

### Pitfall 2: BrowserView Is Deprecated — Use WebContentsView

**What goes wrong:** Building on `BrowserView` (the historical API) means migrating later when it is removed. `BrowserView` was deprecated in Electron 30 (released 2024). The new API is `WebContentsView`, which aligns with Chromium's Views framework.

**Why it happens:** Most tutorials, Stack Overflow answers, and even some Electron docs still reference `BrowserView`. Starting a greenfield project on a deprecated API creates migration debt immediately.

**Consequences:** `BrowserView` will be removed in a future major version. APIs differ enough that migration is non-trivial (addChildView vs addBrowserView, no setAutoResize, default background color differs).

**Prevention:**
- Use `WebContentsView` from day one. It has the same constructor shape as `BrowserView` (`webPreferences` works identically).
- Attach via `win.contentView.addChildView(view)` not `win.addBrowserView()`.
- Manage bounds manually; `setAutoResize()` does not exist on `WebContentsView` — implement a `resize` event listener on the parent `BaseWindow`.
- Set background color explicitly: `WebContentsView` defaults to white (not transparent like `BrowserView`).

**Warning signs:**
- Project scaffolded from pre-2024 boilerplate that uses `new BrowserView()`
- Seeing deprecation warnings in the Electron console

**Phase:** Enforce from Phase 1 (project setup). No `BrowserView` usage at all.

**Sources:** [Electron migration guide](https://www.electronjs.org/blog/migrate-to-webcontentsview) | [Mamezou Developer Portal](https://developer.mamezou-tech.com/en/blogs/2024/03/06/electron-webcontentsview/)

---

### Pitfall 3: contextIsolation Disabled = RCE Attack Surface

**What goes wrong:** Setting `contextIsolation: false` or `nodeIntegration: true` on any WebContentsView that loads untrusted web content (i.e., every service WebView) allows JavaScript running inside those views to access Node.js APIs, read the filesystem, and execute system commands.

**Why it happens:** Older Electron tutorials show this to make IPC simpler. With an aggregator that loads multiple third-party web apps, any XSS in any loaded service becomes an RCE vector against the user's machine.

**Consequences:** One XSS in any embedded service (WhatsApp Web, Instagram, etc.) escalates to full system compromise. Discord patched exactly this class of bug. Not a theoretical risk.

**Prevention:**
- The main window shell: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Each service WebContentsView: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Expose app functionality only via `contextBridge.exposeInMainWorld()` with narrow, validated APIs.
- Validate all IPC message arguments in both the preload and the main process (defence in depth).
- Never use `@electron/remote` — it exposes main process APIs to renderers over IPC with no access control.
- Handle the `will-attach-webview` event to strip dangerous attributes from dynamically created webviews.

**Warning signs:**
- Any `nodeIntegration: true` in webPreferences
- Using `require('electron').remote` anywhere in renderer code
- Preload script that does `contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)` — exposes the entire IPC bus

**Phase:** Enforce as a non-negotiable constraint from Phase 1. Security audit checklist before any release.

**Sources:** [Electron Security Docs](https://www.electronjs.org/docs/latest/tutorial/security) | [SecureLayer7 CVE analysis](https://blog.securelayer7.net/electron-app-security-risks/) | [0-click RCE writeup](https://lsgeurope.com/post/0-click-rce-in-electron-applications)

---

### Pitfall 4: WhatsApp and Instagram Block Non-Chrome User Agents

**What goes wrong:** Electron's default User-Agent string contains "Electron/X.Y.Z" and the underlying Chromium version string. WhatsApp Web and Instagram detect this and either refuse to load or display degraded/broken UIs. WhatsApp Web has historically required a minimum Chrome version in the UA and rejected Chromium variants with unexpected tokens.

**Why it happens:** Meta's services do UA-sniffing to restrict access to "supported" browsers. The "Electron" token in the UA is a reliable signal that the page is inside an embedded Chromium.

**Consequences:** WhatsApp and Instagram — two of the six services — are completely non-functional without UA overriding. Rambox, Franz, and Ferdi all implement UA overriding for exactly this reason.

**Prevention:**
- Override the User-Agent on each service WebContentsView using `session.setUserAgent()` or `webContents.setUserAgent()` before any navigation.
- Use a current Chrome stable UA string, e.g. `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`.
- Strip the "Electron" and "node.js" tokens completely.
- Keep a service-specific UA config map (some services may need Mobile UA to get the mobile-optimized interface).
- Update UA strings as Chrome versions advance — hardcoding a very old version re-triggers the minimum-version check.

**Warning signs:**
- WhatsApp Web stuck on the loading spinner or showing "Update Chrome" banner
- Instagram login page redirecting to the app store
- Console error referencing unsupported browser

**Phase:** Address in the phase implementing service WebViews (core embedding phase). Must be working before any service integration is considered complete.

**Sources:** [Nativefier issue on WhatsApp UA](https://github.com/nativefier/nativefier/issues/1112) | [Rambox changelog (UA override)](https://github.com/ramboxapp/community-edition/wiki/CHANGELOG)

---

### Pitfall 5: Session Partitions Not Assigned = Cookie Bleed Between Services

**What goes wrong:** If two WebContentsViews share the same session (or both use the default session), cookies, localStorage, IndexedDB, and service worker registrations bleed between them. This can log Service A into Service B's account or, more critically, share auth tokens across services from different companies.

**Why it happens:** Electron's default behavior uses a single shared session. Developers forget to assign distinct `partition` strings to each view.

**Consequences:** Services cross-contaminate each other's auth state. At minimum, unexpected logouts. At worst, auth token exposure across service origins.

**Prevention:**
- Assign every service WebContentsView a unique, persistent partition string: `persist:service-whatsapp`, `persist:service-telegram`, etc.
- The `persist:` prefix makes the session survive app restarts (stored on disk). Without it, the session is in-memory only and the user must log in every launch.
- Never share a partition between two services. Even if services are from the same company (e.g., Messenger and Instagram, both Meta), keep them isolated.
- Verify isolation by checking `webContents.session.storagePath` — each service should report a different directory.
- Set sessions before any `loadURL()` call — setting them after navigation has no effect.

**Warning signs:**
- User reports being logged out of one service when adding another
- `webContents.session` returns the same object instance for two different services
- `session.storageDirectory` is identical for two services

**Phase:** Address in Phase 1 of service embedding. This is architectural — retrofitting it later requires wiping all stored sessions.

**Sources:** [Electron session docs](https://www.electronjs.org/docs/latest/api/session) | [GitHub issue #15365 - cookies not persisted in webview](https://github.com/electron/electron/issues/15365)

---

## Moderate Pitfalls

---

### Pitfall 6: Memory Usage — 200–400 MB Per Active Service WebView

**What goes wrong:** Each WebContentsView runs a full Chromium renderer process. With 7 services loaded simultaneously, total RAM consumption easily reaches 1.5–3 GB. Users on 8 GB machines will see heavy pressure. Inactive services still consume memory for their renderer process even if the tab is not visible.

**Why it happens:** Each partition is a separate process. Chromium renderer memory for web apps like Slack or Teams routinely exceeds 300 MB alone. Multiplied by 7, this is structural, not a bug.

**Prevention:**
- Implement service hibernation: destroy the `WebContentsView` (not just hide it) for services not visited in N minutes. Recreate and reload on next selection.
- Maintain a maximum-active-views limit (e.g., 3 simultaneously loaded). Services beyond this limit are dormant.
- On view recreation after hibernation, restore scroll position or last-known URL if needed.
- Expose a "Memory Saver" toggle in settings (Rambox calls this "Hibernation"), so power users can tune the tradeoff.
- Use `webContents.forcefullyCrashRenderer()` as a last resort to free stuck renderer processes.

**Warning signs:**
- Task Manager shows 7+ `Gradd Helper (Renderer)` processes each at 200+ MB
- Users complain about laptop fan spinning up with all services open
- App becomes sluggish after 30+ minutes of continuous use

**Phase:** Implement basic hibernation in the service management phase. Performance tuning in a dedicated optimization pass.

**Sources:** [The Register on Rambox RAM usage](https://www.theregister.com/2021/11/19/friday_foss_fest/) | [Electron performance docs](https://www.electronjs.org/docs/latest/tutorial/performance) | [Tidal Engineering - memory troubles](https://developer.tidal.com/blog/fixing-memory-troubles-with-electron-webapps)

---

### Pitfall 7: Keyboard Shortcut Conflicts Between App Shell and Service WebViews

**What goes wrong:** When a WebContentsView has keyboard focus, it captures all keystrokes including Ctrl+W (close tab), Ctrl+R (reload), and other shortcuts that the Electron app shell needs. Conversely, app-level menu shortcuts can fire inside webview context unexpectedly. Focus also fails to restore correctly after the window is blurred and re-focused.

**Why it happens:** OOPIF (Out-of-Process iframes) architecture means keyboard events inside webviews do not propagate to the main window's DOM. The app shell cannot intercept keys that the embedded web app has handled. This is a long-standing Electron issue (GitHub issue #14258 dating to 2018, still partially open).

**Consequences:** Users cannot use app shortcuts when a service is focused. Ctrl+W might close the Electron window rather than doing nothing, or do nothing rather than triggering a meaningful app action.

**Prevention:**
- Register all app-level shortcuts with Electron's `globalShortcut` API or as `accelerator` on `MenuItem` — these fire regardless of focus context.
- Avoid relying on DOM keyboard event listeners in the shell for any shortcut that must work when a service is focused.
- For app-specific shortcuts (switching services, toggling sidebar), use accelerators that services would not naturally intercept (e.g., Alt+1 through Alt+9 for service switching).
- Implement a `blur`/`focus` event handler on the BrowserWindow to explicitly re-focus the active WebContentsView after the window regains focus.
- Accept that some conflicts (e.g., Ctrl+F triggering in-page search on the embedded service) are intentional — do not fight the web app's native shortcuts.

**Warning signs:**
- Ctrl+R reloading the entire app window instead of the active service
- Typing in a service and accidentally triggering app menu items
- After alt-tabbing back, keystrokes going nowhere until the user clicks inside the service

**Phase:** Address during app shell + service switching phase. Plan accelerators before implementing navigation.

**Sources:** [GitHub issue #14258 - webview traps keyboard events](https://github.com/electron/electron/issues/14258) | [GitHub issue #14514 - menu shortcuts in webview](https://github.com/electron/electron/issues/14514)

---

### Pitfall 8: Windows Notification Requires AppUserModelID Setup

**What goes wrong:** Electron notifications silently fail on Windows during development and in unsigned/improperly-packaged builds unless `app.setAppUserModelId()` is called before the app is ready. In production, the Start Menu shortcut must contain an AppUserModelID and a ToastActivatorCLSID for notifications to route correctly through the Windows notification center.

**Why it happens:** Windows notification delivery requires a registered app identity via the COM Toast Activator mechanism. Electron partially handles this if using Squirrel.Windows installer, but NSIS (the recommended installer) does not do this automatically.

**Consequences:** `new Notification(...)` calls in development silently do nothing. Notification click handlers (routing the user to the relevant service on click) do not fire. In NSIS builds, the Start Menu shortcut may be missing the required properties.

**Prevention:**
- Call `app.setAppUserModelId('com.yourcompany.gradd')` early in `app.whenReady()`, before creating any windows.
- In development, also call this to get notifications working without an installer.
- Use `electron-builder`'s `appId` in `package.json` — it becomes the AppUserModelID automatically in production builds.
- For notification click routing: use a protocol handler (`app.setAsDefaultProtocolClient`) combined with Toast XML `activationType="protocol"` to deep-link into the correct service tab.
- Test notification delivery on a clean Windows user account that has no pre-existing app installs.

**Warning signs:**
- `new Notification('test').show()` in main process does nothing
- No notification appears in Windows Action Center
- Notification appears but clicking it does nothing (click handler not firing)

**Phase:** Address in notifications phase. Must be validated on a clean Windows install, not just the dev machine.

**Sources:** [Electron Notifications docs](https://www.electronjs.org/docs/latest/tutorial/notifications) | [sipgate blog - Windows notifications with action buttons](https://www.sipgate.de/blog/how-to-create-native-notifications-with-action-buttons-on-windows-for-your-electron-app) | [ISE Developer Blog - NodeRT notifications](https://devblogs.microsoft.com/ise/2016/10/30/showing-native-windows-notifications-from-electron-using-nodert/)

---

### Pitfall 9: electron-updater Windows Signing — EV Certificate and SmartScreen

**What goes wrong:** Unsigned or OV-signed Electron installers trigger Windows Defender SmartScreen with "Windows protected your PC" on every install, requiring an extra click from users. Since June 2023 Microsoft deprecated OV (software-based) code signing certificates — they provide zero SmartScreen reputation benefit now. Since March 2024, even EV certificates no longer instantly remove SmartScreen warnings; reputation must be earned over time.

**Why it happens:** SmartScreen uses file reputation scoring. New EV certificates have zero reputation and must accumulate download counts before warnings disappear. The old "buy EV cert = no SmartScreen" rule no longer holds.

**Prevention:**
- Use an EV certificate (hardware-stored, USB token or HSM). Required for any meaningful SmartScreen bypass path.
- Alternatively, Microsoft Azure Trusted Signing (cloud-based, cheaper) gets rid of SmartScreen warnings but is only available to US/Canada organizations with 3+ years of business history — not viable for all teams.
- Submit the installer to Microsoft's Defender Intelligence portal for manual review to accelerate initial reputation.
- For per-user installs (no UAC prompt), set `nsis.perMachine: false` in electron-builder config. Per-machine installs (`perMachine: true`) require elevation and trigger a UAC prompt on every update for non-admin users.
- NSIS installer updates: if installed per-machine, updates require UAC elevation. If the update silently fails for non-admins, this is the cause.
- Do not use Squirrel.Windows — it is deprecated. Use NSIS exclusively.

**Warning signs:**
- SmartScreen "Windows protected your PC" on fresh install
- `electron-updater` update silently fails — no error, no install
- UAC dialog appears on update but install doesn't complete for non-admin accounts

**Phase:** Address in packaging/distribution phase. EV cert acquisition has a 1–2 week lead time; plan ahead.

**Sources:** [Electron code signing docs](https://www.electronjs.org/docs/latest/tutorial/code-signing) | [DEV.to - How I code signed Electron on Windows](https://dev.to/awohletz/how-i-code-signed-an-electron-app-on-windows-30k5) | [Sematicon - EV vs OV](https://www.sematicon.com/en/ev-code-signing-windows/)

---

### Pitfall 10: Service Notification Interception — Web Push API Not Available in Electron

**What goes wrong:** Some services (particularly web-based PWAs) use the Web Push API with service workers to deliver notifications. Electron's Chromium does not implement `PushManager` — it is intentionally stripped from the renderer. Services that rely on web push (rather than polling or WebSocket) receive no notifications inside the aggregator.

**Why it happens:** Web push requires a push service endpoint (FCM, Mozilla Push, etc.) registered with the browser. Electron has no mechanism to register with these external push services.

**Consequences:** For services that only push via Web Push, the Electron-embedded version will never show new message notifications in the native notification center. The in-tab notification badges (unread counts injected via JS) may still work, but OS-level notifications won't.

**Prevention:**
- For each target service, test whether their web app uses polling/WebSocket (works) or Web Push (doesn't work) for delivering notifications.
- Telegram Web, WhatsApp Web, and Messenger primarily use WebSocket connections — notifications can be intercepted by monitoring `new Notification(...)` calls inside the webview.
- Intercept `new Notification(...)` calls in the service WebContentsView via a preload script or `executeJavaScript` — catch these and re-dispatch through Electron's native notification system.
- This interception approach requires injecting a `Notification` override into the page's context: replace `window.Notification` with a proxy that fires `ipcRenderer.send('new-notification', {...})` and then dispatches via the Electron main process.
- Services using Web Push exclusively may need a "best-effort" note in the app: OS notifications may not work for all services.

**Warning signs:**
- Service shows unread count badge in-tab but no Windows notification appears
- Service works normally in Chrome but never triggers notifications inside Gradd
- Checking DevTools Application panel shows "Push Notifications: Blocked" on service page

**Phase:** Address in notifications phase. Test each of the 7 services individually. Budget time for service-specific quirks.

**Sources:** [Medium - Web Push support in Electron](https://medium.com/@MatthieuLemoine/my-journey-to-bring-web-push-support-to-node-and-electron-ce70eea1c0b0) | [Electron push notifications docs](https://www.electronjs.org/docs/latest/api/push-notifications)

---

## Minor Pitfalls

---

### Pitfall 11: Missing Visual C++ Redistributable on Clean Windows Installs

**What goes wrong:** If the app uses native Node.js modules (node-ffi, node-gyp-built modules, etc.), those DLLs depend on `vcruntime140.dll` and `msvcp140.dll` from Visual C++ 2015–2022 Redistributable. A fresh Windows installation may not have these. The app opens, shows a splash screen, then silently fails to initialize.

**Why it happens:** Electron itself does not require VC++ redist, but any native addon does. The NSIS installer bundled by electron-builder does not install the redistributable by default.

**Prevention:**
- Audit the dependency tree for native modules. For this project (no native addons planned), this may be moot.
- If native modules are added (e.g., for system tray integration, audio), add a custom NSIS script that checks for and installs VC++ redist as a prerequisite.
- Consider distributing via WinGet or Microsoft Store for future versions — both handle runtime dependencies automatically.

**Warning signs:**
- App fails silently on machines without VS Build Tools installed
- `The program can't start because VCRUNTIME140.dll is missing` error dialog

**Phase:** Packaging/distribution phase. Only relevant if native modules are introduced.

**Sources:** [Tabby GitHub issue #11059](https://github.com/Eugeny/tabby/issues/11059) | [electron-builder issue #8865](https://github.com/electron-userland/electron-builder/issues/8865)

---

### Pitfall 12: Unread Badge on Windows Taskbar — API Limitation

**What goes wrong:** The Electron `app.badgeCount` API is explicitly documented as not supported on Windows. Setting it has no effect. Windows taskbar badges (the number overlay on app icons) require the Windows `ITaskbarList3::SetOverlayIcon` API, which Electron exposes only as `win.setOverlayIcon()` with an icon image — not a numeric count.

**Why it happens:** Windows badge behavior differs from macOS/Linux. Windows shows overlay icons (images), not numeric badges, on the taskbar.

**Prevention:**
- Use `win.setOverlayIcon(nativeImage, description)` to draw a custom badge image. Generate the badge image dynamically using a canvas or by picking from a pre-generated set of count images (1–9+).
- For tray icon badges, regenerate the tray icon image with an overlaid count (via `nativeImage` compositing or an off-screen canvas).
- Do not use `app.badgeCount` — it is a no-op on Windows and will mislead future developers.

**Warning signs:**
- `app.badgeCount = 5` does nothing on Windows
- Taskbar shows no unread indication even though messages exist

**Phase:** Notifications/tray phase. Use overlay icon approach from the start.

**Sources:** [Electron GitHub issue #3148](https://github.com/electron/electron/issues/3148) | [Electron Notifications docs](https://www.electronjs.org/docs/latest/tutorial/notifications)

---

### Pitfall 13: Gadu-Gadu Has a Web Client but It Is Limited

**What goes wrong:** Gadu-Gadu (GG) does have a web client at `web.gadu-gadu.pl`. It is accessible in a standard browser. However, it is the least-documented of the 7 services and has undergone significant transformation in 2024–2025 under new ownership (Fintecom S.A.). Feature parity with native apps is unknown, and the web client may have UA or login requirements that are not publicly documented.

**Why it happens:** GG is a niche Polish-market messenger with a much smaller developer community than the other 6 services. Less community knowledge exists about embedding it.

**Consequences:** GG may work fine as an embedded WebContentsView, or it may have issues that are harder to diagnose due to lack of community precedent.

**Prevention:**
- Manually test `web.gadu-gadu.pl` in a plain Chromium browser first to confirm the web client is functional.
- Apply the same UA-override pattern as WhatsApp/Instagram — strip the Electron token.
- If the web client is non-functional or abandoned, consider omitting GG from v1 scope and adding it as a "community-contributed service" later.
- The Gadu-Gadu Wikipedia article and ArchiveApp both indicate a web version exists, but no Electron-specific community precedent was found during research.

**Warning signs:**
- `web.gadu-gadu.pl` shows a maintenance page or redirects to the native app download
- No login UI appears — only an app download prompt
- Console errors indicating unsupported browser

**Phase:** Service validation/integration phase. Test GG manually before committing to it in v1 scope.

**Sources:** [Gadu-Gadu Wikipedia](https://en.wikipedia.org/wiki/Gadu-Gadu) | [webtechsurvey.com - web.gadu-gadu.pl](https://webtechsurvey.com/website/web.gadu-gadu.pl) | [Accessify - web.gadu-gadu.pl](https://www.accessify.com/g/web.gadu-gadu.pl)

---

### Pitfall 14: Refresh Token Storage — Plain electron-store Is Not Encrypted by Default

**What goes wrong:** `electron-store` stores data as a plain JSON file on disk. If the Google OAuth refresh token is stored there without encryption, it is readable by any process running as the same OS user — or by malware inspecting the app's userData directory.

**Why it happens:** `electron-store` is the go-to local storage solution but encrypts nothing by default. Developers add a `schema` but forget the `encryptionKey` option.

**Prevention:**
- Pass `encryptionKey` to `electron-store` for any store holding tokens. The key can be derived from a machine-specific value (e.g., using `keytar` to store the encryption key in the Windows Credential Store).
- Use `keytar` (`node-keytar`) to store the actual refresh token in the Windows Credential Manager (DPAPI-protected). Retrieve it at runtime — never write it to disk in plaintext.
- Clear the stored token on explicit logout via the in-app Google sign-out flow.

**Warning signs:**
- Refresh token visible in plain text inside `%APPDATA%\gradd\config.json`
- Store file contains `access_token` or `refresh_token` fields without obfuscation

**Phase:** Google sync/auth phase. Establish secure token storage pattern before writing any OAuth token to disk.

**Sources:** [electron-store GitHub](https://github.com/sindresorhus/electron-store) | [Auth0 - Securing Electron with OpenID Connect](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/)

---

## Phase-Specific Warnings Summary

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Project setup / scaffolding | Using deprecated `BrowserView` from old boilerplate | Use `WebContentsView` from day one |
| Project setup / scaffolding | `nodeIntegration: true` in boilerplate | Enforce security defaults in initial config |
| Service embedding — core | WhatsApp/Instagram rejecting Electron UA | Override UA per service before first `loadURL()` |
| Service embedding — core | Cookie bleed between services | Assign unique `persist:service-X` partition to every view |
| Service embedding — core | Memory: 7 services × 300 MB = 2+ GB | Design hibernation architecture before implementing switching |
| App shell + navigation | Keyboard shortcuts stolen by webview | Use `globalShortcut` / `accelerator` for all app shortcuts |
| Notifications | `new Notification()` silent on Windows | Call `setAppUserModelId()` early; test on clean Windows |
| Notifications | Service push via Web Push API (not WebSocket) | Intercept `window.Notification` in webview preload |
| Notifications | Taskbar badge: `app.badgeCount` is no-op on Windows | Use `win.setOverlayIcon()` with dynamically rendered image |
| Google sync / OAuth | OAuth in embedded WebView blocked by Google | System browser + loopback redirect + PKCE only |
| Google sync / OAuth | Refresh token stored in plaintext | Use `keytar` + Windows Credential Manager |
| Distribution / packaging | SmartScreen warning on unsigned installer | EV certificate acquisition; plan 2-week lead time |
| Distribution / packaging | NSIS update fails for non-admin users | Default to per-user install (`perMachine: false`) |
| GG service validation | GG web client status unknown | Manual validation before committing to v1 scope |
