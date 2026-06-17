# Requirements: Gradd

**Defined:** 2026-06-17
**Core Value:** All your messaging apps in one place, with a UI that actually looks good — the app Rambox should have been.

## v1 Requirements

### Services

- [ ] **SVC-01**: App embeds Messenger (messenger.com) in an isolated WebContentsView with a persistent local session
- [ ] **SVC-02**: App embeds WhatsApp Web (web.whatsapp.com) with a Chrome user-agent override, in its own isolated WebContentsView
- [ ] **SVC-03**: App embeds Telegram Web (web.telegram.org) in an isolated WebContentsView
- [ ] **SVC-04**: Each service session persists locally between app restarts — user does not need to re-login on restart
- [ ] **SVC-05**: User can reorder services via drag-and-drop in the active layout (sidebar or tabs)
- [ ] **SVC-06**: User can enable or disable individual services without removing them

### Layout

- [ ] **LAYT-01**: User can choose between two layout modes: left sidebar icon bar or top horizontal service tabs
- [ ] **LAYT-02**: Selected layout mode persists across app restarts

### Notifications

- [ ] **NOTF-01**: App displays native Windows toast notifications for incoming messages from all active, non-muted services
- [ ] **NOTF-02**: App displays aggregate unread count as a Windows taskbar overlay badge icon on the app icon

### Do Not Disturb

- [ ] **DND-01**: User can toggle global Do Not Disturb mode on/off from the system tray icon
- [ ] **DND-02**: User can configure a recurring DND schedule (start time, end time, active days)
- [ ] **DND-03**: While DND is active, no notifications or sounds are produced by any service

### Google Account Sync

- [ ] **AUTH-01**: User can sign in with a Google Account via system browser (PKCE OAuth2 flow — no embedded WebView OAuth)
- [ ] **AUTH-02**: Signed-in user's service list and enable/disable states are synced to cloud (Firestore) so configuration survives reinstall
- [ ] **AUTH-03**: User can sign out, reverting the app to local-only mode with the last-known config

### Windows System Integration

- [ ] **SYS-01**: Closing the main window minimizes the app to the system tray instead of quitting
- [ ] **SYS-02**: System tray icon shows a right-click context menu with: DND toggle, Show/Hide window, Quit
- [ ] **SYS-03**: App checks for updates on launch and displays a non-intrusive banner when an update is available; user triggers manual download and install

## v2 Requirements

### Services (extended)

- **SVC-V2-01**: Support Slack (app.slack.com)
- **SVC-V2-02**: Support Instagram Direct (instagram.com/direct)
- **SVC-V2-03**: Support Gadu-Gadu — conditional on web client embeddability spike
- **SVC-V2-04**: Custom label per service instance (e.g. "Work Slack", "Personal WhatsApp")
- **SVC-V2-05**: Add or remove service instances via a service management UI

### Notifications (extended)

- **NOTF-V2-01**: Per-service unread badge count shown on each service icon in sidebar/tabs
- **NOTF-V2-02**: Custom notification sound per service — user uploads or selects from a library
- **NOTF-V2-03**: Per-service notification mute toggle (independent of global DND)

### Windows System Integration (extended)

- **SYS-V2-01**: Launch at Windows startup option (with optional start-minimized-to-tray)
- **SYS-V2-02**: Keyboard shortcuts: Ctrl+1–9 to jump to service by position, Ctrl+Tab to cycle

### Google Account Sync (extended)

- **AUTH-V2-01**: Sync app preferences to cloud (theme, layout mode, DND schedule, sound assignments)
- **AUTH-V2-02**: Auto-sync on app launch — pull latest config from cloud on startup

## Out of Scope

| Feature | Reason |
|---------|--------|
| Signal | No web client exists — Signal explicitly does not offer an embeddable web app |
| Mobile app | Windows desktop only in v1 |
| Service credential sync | Sessions are local-only per device by design — user re-logs in on new machines |
| Per-contact or per-keyword notification sounds | Per-service sounds are sufficient for v1 |
| In-app messaging reimplementation | Services are embedded web apps, not native UI rebuilds |
| macOS / Linux support | Windows-only in v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SVC-01 | Phase 2 | Pending |
| SVC-02 | Phase 2 | Pending |
| SVC-03 | Phase 2 | Pending |
| SVC-04 | Phase 2 | Pending |
| SVC-05 | Phase 5 | Pending |
| SVC-06 | Phase 5 | Pending |
| LAYT-01 | Phase 1 | Pending |
| LAYT-02 | Phase 1 | Pending |
| NOTF-01 | Phase 3 | Pending |
| NOTF-02 | Phase 3 | Pending |
| DND-01 | Phase 4 | Pending |
| DND-02 | Phase 4 | Pending |
| DND-03 | Phase 4 | Pending |
| AUTH-01 | Phase 6 | Pending |
| AUTH-02 | Phase 6 | Pending |
| AUTH-03 | Phase 6 | Pending |
| SYS-01 | Phase 1 | Pending |
| SYS-02 | Phase 1 | Pending |
| SYS-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-17*
*Last updated: 2026-06-17 after roadmap creation*
