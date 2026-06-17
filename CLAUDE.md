<!-- GSD:project-start source:PROJECT.md -->
## Project

**Gradd — Desktop Chat Aggregator**

Gradd is a Windows desktop application that aggregates multiple messaging platforms (Messenger, WhatsApp, Telegram, Slack, Instagram Direct, Signal, Gadu-Gadu) into a single polished interface. Each service runs in its own isolated Chromium WebView. Users log in with Google to sync their service configuration and preferences across devices.

**Core Value:** All your messaging apps in one place, with a UI that actually looks good — the app Rambox should have been.

### Constraints

- **Platform**: Windows desktop only — no macOS/Linux for v1
- **Engine**: Chromium (Electron) — services must be embeddable as web apps
- **Sessions**: Local persistence only — no cross-device session recovery (user must re-scan QR on new device)
- **Sync**: Google OAuth cloud sync for config only, not message data
- **Tech stack**: Electron + React shell + electron-store (local) + Google OAuth2 for cloud sync + electron-updater for updates
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Electron | 35+ (pin to latest stable at project start — currently 42.x) | Desktop runtime | Only framework with full Chromium per-partition session isolation; Tauri uses WebView2 OS component which lacks reliable per-partition persistence needed for WhatsApp/Signal QR sessions |
| Node.js | 24.x (bundled with Electron 42) | Main process runtime | Comes with Electron; no separate install needed |
| TypeScript | 5.x | Language | End-to-end type safety across main/preload/renderer boundaries; essential for the IPC contract surface |
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
### Embedded Service Views
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| WebContentsView + BaseWindow | Electron built-in (30+) | Embed each chat service | BrowserView is deprecated since Electron 30; WebContentsView is the current replacement; uses Chromium Views API directly; fully supported in Electron 35+ |
### Session Isolation
### Google OAuth2 (Config Sync)
| Approach | Verdict |
|----------|---------|
| Manual PKCE loopback flow | RECOMMENDED |
| electron-google-oauth2 library | NOT recommended — last published 2021, abandoned |
| Embedded webview OAuth | NOT recommended — Google blocks OAuth in embedded browsers |
### Auto-Update
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-updater | 6.x (part of electron-builder) | Update delivery | Works with NSIS installer on Windows; supports differential downloads (delta updates, not full installer re-download); integrates with GitHub Releases as update feed |
### Build & Packaging
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-builder | 25.x | Packaging + installer | Most mature Electron packager; NSIS is the default/recommended Windows target; Squirrel.Windows is deprecated in electron-builder; portable target available in same config |
### Windows Notifications
| Technology | Purpose | Why |
|------------|---------|-----|
| Electron `Notification` (main process) | Service-level OS toast notifications | Built-in; uses Windows Action Center; supports `toastXml` for full WinRT Toast customization; no native addon required |
### Audio Playback (Custom Notification Sounds)
### IPC Architecture
### Security Baseline
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
## Project Scaffold Command
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
