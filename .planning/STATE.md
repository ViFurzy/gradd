---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
last_updated: "2026-06-18T06:40:56.271Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 1
  completed_plans: 1
  percent: 85
---

# State: Gradd Desktop Chat Aggregator

**Project:** Gradd — Desktop Chat Aggregator
**Core Value:** All your messaging apps in one place, with a UI that actually looks good — the app Rambox should have been.
**Milestone:** v1 MVP

---

## Current Position

**Phase:** 2
**Plan:** Not started
**Status:** Ready to plan

**Progress:**

```
Phase 1 [x] Shell Foundation
Phase 2 [x] Service Embedding
Phase 3 [x] Notifications
Phase 4 [x] Do Not Disturb
Phase 5 [x] Service Management
Phase 6 [x] Google Account Sync
Phase 7 [ ] Packaging and Distribution

Overall: 6/7 phases complete
```

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 7 |
| Phases complete | 0 |
| Requirements total (v1) | 19 |
| Requirements complete | 0 |
| Plans written | 0 |
| Plans complete | 0 |

---

## Accumulated Context

### Key Decisions (from research)

- **Runtime:** Electron 42.x (not Tauri) — Tauri uses OS WebView2, lacks reliable per-partition session persistence
- **WebView API:** WebContentsView + BaseWindow — BrowserView deprecated since Electron 30
- **Session isolation:** `persist:service-<uuid>-<type>` partition per view — set before loadURL()
- **IPC:** contextBridge + preload scripts only — nodeIntegration: false, contextIsolation: true
- **Two preload scripts:** shell-preload.js (React shell) and service-bridge.js (Notification intercept + title observer)
- **Taskbar badge:** `win.setOverlayIcon()` — NOT `app.badgeCount` (documented no-op on Windows)
- **Google OAuth:** PKCE + system browser + loopback `http.createServer` — Google blocks OAuth in embedded Chromium since 2021
- **Token storage:** `safeStorage.encryptStringAsync()` then electron-store — never plaintext refresh token
- **Build:** electron-vite + electron-builder NSIS — Squirrel.Windows deprecated
- **Signal:** Dropped from v1 — no web client exists
- **Gadu-Gadu:** Conditional on spike at start of Phase 2

### Critical Implementation Notes

- Call `app.setAppUserModelId('com.gradd.app')` as the very first line in main process — before any window creation (blocks notifications)
- `backgroundThrottling: false` on all service WebContentsViews (default throttles timers in hidden views)
- WhatsApp and Instagram require Chrome UA override — set on session before loadURL()
- NSIS: `perMachine: false` to avoid UAC prompts on update
- electron-store v10 is pure ESM — entire main process must use ESM

### Open Risks

| Risk | Mitigation | Resolves |
|------|------------|---------|
| Gadu-Gadu embedding viability unconfirmed | Manual spike at Phase 2 start | Phase 2 |
| Instagram Direct embedding reliability | Manual test with Chrome UA override in Phase 2 | Phase 2 |
| Per-service notification mechanism (WebSocket vs Web Push) | DevTools audit before Phase 3 | Phase 3 |
| EV code signing SmartScreen behavior | Start EV cert acquisition at Phase 4-5 (1-2 week lead time) | Phase 7 |

### Todos

- [ ] Start EV certificate acquisition process during Phase 4 or 5

---

## Session Continuity

**Last updated:** 2026-06-17
**Last action:** Roadmap created — ready for Phase 1 planning
**Next action:** `/gsd:plan-phase 1`

---

*State initialized: 2026-06-17*
