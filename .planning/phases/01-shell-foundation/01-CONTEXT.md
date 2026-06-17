# Phase 1: Shell Foundation - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Working Electron application with a shell UI, persistent window state, tray icon, and the two layout modes (left sidebar icon bar and top horizontal tab bar). No services yet — the contract covers the window chrome, empty state placeholder, and all structural foundations. Downstream phases plug services into this frame.

</domain>

<decisions>
## Implementation Decisions

### Window Chrome

- **D-01:** Use `titleBarStyle: 'hidden'` with native `titleBarOverlay` — Windows provides the native close/minimize/maximize buttons. Do NOT use `frame: false` + custom HTML buttons.
- **D-02:** Set `titleBarOverlay: { color: '#1a1a1f', symbolColor: '#e8e8ec', height: 32 }` — matches the secondary surface token and text-primary token from UI-SPEC. Height explicitly 32px (not OS default).
- **D-03:** Enable Windows 11 Mica material: `transparent: true` + `backgroundMaterial: 'mica'` in BrowserWindow config. Falls back to solid `#0f0f11` on Windows 10 (graceful degradation — no special handling needed, backgroundMaterial is ignored on Win10).
- **D-04:** Mica shows through the **content area only**. Sidebar (`#1a1a1f`) and tab bar (`#1a1a1f`) backgrounds remain solid. CSS rule: `.content-area { background: transparent }` — sidebar and tab bar components use the solid secondary token.

### Layout and Persistence

- **D-05:** Default layout on first launch: `"sidebar"` — per UI-SPEC.
- **D-06:** Layout mode persisted to electron-store key `layout.mode` — values: `"sidebar"` | `"tabs"`.
- **D-07:** Window bounds persisted to electron-store key `window.bounds` — stores `{ x, y, width, height, maximized }`.
- **D-08:** Initial window dimensions: 1200×800. Minimum: 800×600. Restore last-saved bounds on launch.

### App Identity and IPC

- **D-09:** Call `app.setAppUserModelId('com.gradd.app')` as the VERY FIRST line in main process — before any window or Tray creation. This is required for Windows notifications to work in later phases.
- **D-10:** IPC: contextBridge + preload scripts only. `nodeIntegration: false`, `contextIsolation: true`.
- **D-11:** electron-store v10 is pure ESM — entire main process must use ESM (`.mjs` or `"type": "module"` in package.json scope).

### Tech Stack (carried forward from project decisions)

- **D-12:** Runtime: Electron 42.x. Build: electron-vite + electron-builder NSIS.
- **D-13:** Frontend: React 19.x, TypeScript 5.x, Tailwind CSS 4.x, Zustand 5.x.
- **D-14:** Persistence: electron-store 10.x (local config). No database.

### Claude's Discretion

- Project scaffold: use `npm create @quick-start/electron@latest` with React+TypeScript template, or manual setup — implementer decides
- Zustand store slice structure for Phase 1
- Tray icon asset design (placeholder acceptable in Phase 1)
- IPC channel naming conventions
- Exact preload script split for Phase 1 (shell-preload.js is sufficient — service-bridge.js not needed until Phase 2)

</decisions>

<specifics>
## Specific Ideas

- Mica material for Windows 11 is a premium differentiator — "the app that actually looks good". It should be visible in the content area when no service is loaded (the empty state placeholder sits on the Mica background).
- Sidebar and tab bar are solid because their color contrast and interaction states (active indicator, hover surface) depend on predictable background values from the UI-SPEC color tokens.
- The tray menu has exactly: "Do Not Disturb" (grayed, placeholder), "Show Gradd" / "Hide Gradd" (toggles), "Quit" (destructive red label). No layout toggle in the tray for Phase 1 — layout switching is deferred to Phase 5's service management UI.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Visual and Interaction Contract
- `.planning/phases/01-shell-foundation/01-UI-SPEC.md` — Full UI design contract: color tokens, typography, spacing, layout mode specs (sidebar and tab bar dimensions), interaction states, window behavior contract, copywriting contract, empty state spec. This is the primary visual authority for Phase 1.

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: LAYT-01, LAYT-02, SYS-01, SYS-02. Full acceptance criteria and v1 scope.

### Project State and Architecture
- `.planning/STATE.md` — Accumulated key decisions (Electron APIs, IPC pattern, session isolation strategy, build tooling) and critical implementation notes (AppUserModelId placement, backgroundThrottling, UA overrides, ESM requirement).
- `.planning/PROJECT.md` — Project constraints, core value, and key decisions log.

### Phase Goals
- `.planning/ROADMAP.md` §"Phase 1: Shell Foundation" — Goal and success criteria used for verification.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield project. Phase 1 creates the foundation.

### Established Patterns
- None yet — Phase 1 establishes all patterns.

### Integration Points
- electron-store: initialized in main process, exposed to renderer via contextBridge. All subsequent phases read/write through the same store instance.
- BaseWindow + WebContentsView: shell's content region is the host for service views added in Phase 2. Phase 1 must size and position the content region correctly (accounting for sidebar width or tab bar height) so Phase 2's views drop in without layout changes.
- Tray: created in Phase 1. Phase 3 (Notifications) and Phase 4 (DND) add to the tray menu without rebuilding it.

</code_context>

<deferred>
## Deferred Ideas

- Layout toggle in the tray menu: the user didn't select this as a discussion area, and UI-SPEC excludes it from the titlebar in Phase 1. Implementer may add it to the tray menu as a convenience; it's not a Phase 1 requirement.
- App logo / branding in the titlebar drag area: not in scope for Phase 1.
- Window vibrancy beyond Mica (e.g., acrylic, blurred): Mica decided, no further material variation needed.

</deferred>

---

*Phase: 01-shell-foundation*
*Context gathered: 2026-06-18*
