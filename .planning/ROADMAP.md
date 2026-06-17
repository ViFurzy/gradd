# Roadmap: Gradd Desktop Chat Aggregator

**Milestone:** v1 MVP
**Granularity:** Standard
**Mode:** Vertical MVP — each phase delivers a working end-to-end slice
**Requirements coverage:** 19/19 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Shell Foundation** — Working Electron window with React shell, tray icon, close-to-tray, layout toggle
- [ ] **Phase 2: Service Embedding** — All confirmed services embedded with isolated, persistent sessions
- [ ] **Phase 3: Notifications** — Native Windows toast notifications and taskbar overlay unread badge
- [ ] **Phase 4: Do Not Disturb** — Global DND toggle from tray and recurring DND schedule
- [ ] **Phase 5: Service Management** — Drag-to-reorder services and per-service enable/disable toggle
- [ ] **Phase 6: Google Account Sync** — PKCE OAuth sign-in, Firestore config sync, sign-out
- [ ] **Phase 7: Packaging and Distribution** — NSIS installer, portable EXE, in-app update notification

---

## Phase Details

### Phase 1: Shell Foundation
**Goal**: User has a working Electron application with a shell UI, persistent window state, tray icon, and the two layout modes — no services yet, but every structural foundation is in place
**Depends on**: Nothing (first phase)
**Requirements**: LAYT-01, LAYT-02, SYS-01, SYS-02
**Success Criteria** (what must be TRUE):
  1. App launches to a window with a dark-first shell UI showing either a left sidebar icon bar or top horizontal tab bar, selectable by the user
  2. The chosen layout mode is still active after closing and reopening the app
  3. Closing the main window does not quit the app — it minimizes to the system tray
  4. The tray icon shows a right-click menu with at least: DND toggle (placeholder), Show/Hide window, and Quit
**Plans**: TBD
**UI hint**: yes

### Phase 2: Service Embedding
**Goal**: User can see and use their messaging services inside the app, each in its own isolated WebContentsView with a session that survives app restarts
**Depends on**: Phase 1
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04
**Success Criteria** (what must be TRUE):
  1. Messenger, WhatsApp Web, and Telegram Web each load correctly inside the app and are accessible via the sidebar or tab bar
  2. WhatsApp loads without service rejection (Chrome UA override confirmed working)
  3. Switching between services is instant — the previously active service is not re-loaded
  4. After closing and reopening the app, the user does not need to log in again to any previously authenticated service
  5. Sessions are fully isolated — cookies and storage from one service are never accessible to another
**Plans**: TBD

### Phase 3: Notifications
**Goal**: User receives Windows native notifications for incoming messages and can see the total unread count on the Windows taskbar icon
**Depends on**: Phase 2
**Requirements**: NOTF-01, NOTF-02
**Success Criteria** (what must be TRUE):
  1. When a new message arrives in any active service, a Windows toast notification appears in the action center
  2. The Windows taskbar overlay badge on the Gradd icon displays the aggregate unread message count across all services
  3. Notifications are visible on a clean Windows account (AppUserModelId correctly set before window creation)
**Plans**: TBD

### Phase 4: Do Not Disturb
**Goal**: User can suppress all notifications and sounds on demand, either manually from the tray or automatically via a configured recurring schedule
**Depends on**: Phase 3
**Requirements**: DND-01, DND-02, DND-03
**Success Criteria** (what must be TRUE):
  1. User can toggle DND on and off from the system tray right-click menu and the tray icon visually indicates the active state
  2. While DND is active, no toast notifications appear and no sounds play for any service
  3. User can configure a recurring DND schedule (start time, end time, days of week) and DND activates/deactivates automatically at those times without user action
**Plans**: TBD

### Phase 5: Service Management
**Goal**: User can reorder services by dragging and can disable a service without removing it from the list
**Depends on**: Phase 2
**Requirements**: SVC-05, SVC-06
**Success Criteria** (what must be TRUE):
  1. User can drag a service icon (in sidebar mode) or a tab (in tab mode) to a new position and the new order persists after an app restart
  2. User can disable an individual service — its tab or icon disappears from the active layout and its WebContentsView stops consuming resources
  3. User can re-enable a disabled service and it reappears in the layout at its last known position
**Plans**: TBD
**UI hint**: yes

### Phase 6: Google Account Sync
**Goal**: User can sign in with a Google Account to back up their service configuration to the cloud, and sign out to return to local-only mode
**Depends on**: Phase 5
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Clicking "Sign in with Google" opens the consent screen in the system browser (not inside the app) and completes without a `disallowed_useragent` error
  2. After sign-in, the user's service list and enable/disable states are written to Firestore and are retrievable after a fresh app install on a new machine
  3. Signing out returns the app to local-only mode — the local config is retained and no further cloud sync occurs
**Plans**: TBD

### Phase 7: Packaging and Distribution
**Goal**: User can download and install Gradd via an NSIS installer, and the running app notifies the user non-intrusively when a new version is available
**Depends on**: Phase 6
**Requirements**: SYS-03
**Success Criteria** (what must be TRUE):
  1. An NSIS installer is produced by the build pipeline that installs Gradd on a clean Windows 10/11 VM without requiring elevated UAC prompts for updates
  2. When a new version is published, the running app shows a non-intrusive banner notifying the user; clicking it triggers the download and install
  3. All Phase 1–6 features work identically in the NSIS-packaged build as they do in development
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shell Foundation | 0/? | Not started | - |
| 2. Service Embedding | 0/? | Not started | - |
| 3. Notifications | 0/? | Not started | - |
| 4. Do Not Disturb | 0/? | Not started | - |
| 5. Service Management | 0/? | Not started | - |
| 6. Google Account Sync | 0/? | Not started | - |
| 7. Packaging and Distribution | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| LAYT-01 | Phase 1 |
| LAYT-02 | Phase 1 |
| SYS-01 | Phase 1 |
| SYS-02 | Phase 1 |
| SVC-01 | Phase 2 |
| SVC-02 | Phase 2 |
| SVC-03 | Phase 2 |
| SVC-04 | Phase 2 |
| NOTF-01 | Phase 3 |
| NOTF-02 | Phase 3 |
| DND-01 | Phase 4 |
| DND-02 | Phase 4 |
| DND-03 | Phase 4 |
| SVC-05 | Phase 5 |
| SVC-06 | Phase 5 |
| AUTH-01 | Phase 6 |
| AUTH-02 | Phase 6 |
| AUTH-03 | Phase 6 |
| SYS-03 | Phase 7 |

**Coverage:** 19/19 v1 requirements mapped. No orphans.

---

*Roadmap created: 2026-06-17*
*Project mode: Vertical MVP*
