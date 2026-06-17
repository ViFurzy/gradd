# Feature Landscape: Windows Desktop Chat Aggregator

**Domain:** Desktop messaging aggregator (Rambox-style, Windows-first)
**Researched:** 2026-06-17
**Reference apps:** Rambox, Franz, Ferdi/Ferdium, Hamsket, Station, Shift, Texts, Beeper, Wavebox

---

## Table Stakes

Features users expect from day one. Missing any of these = product feels incomplete and users will not recommend it.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Add services as sidebar icons | Core premise | Low | Icon + label in left sidebar |
| Session persistence across restarts | Users hate re-logging in | Med | Electron partition per service; handled by WebContentsView userData paths |
| Per-service unread badge on sidebar icon | The entire point of aggregation | Med | Must scrape title/document.title or listen to notification events from each WebContents |
| Taskbar icon with total unread badge | Windows standard for chat apps | Med | BrowserWindow.setOverlayIcon with dynamic canvas rendering; must aggregate counts |
| System tray icon | Chat apps always tray | Low | Electron Tray API; standard expectation from every comparable app |
| Close to tray (not quit) | De facto standard for chat desktop apps — Slack, Telegram, Discord all do this | Low | Intercept close event; configurable "quit vs tray" toggle |
| Launch at Windows startup | Users want it "always there" | Low | app.setLoginItemSettings |
| Do-not-disturb mode | Distraction management | Low | Global flag; suppress all notifications while DND active |
| Dark mode (first-class, not afterthought) | Power user expectation in 2024-25; 76%+ of users prefer dark | Low | Dark-first design per PROJECT.md requirement |
| Per-service notification toggle (on/off) | Users don't want every app pinging | Low | Stored per service in electron-store |
| Mute specific service sounds | Some apps ping annoyingly | Low | Per-service sound enable/disable setting |
| Drag-to-reorder sidebar services | Every aggregator has this | Low | React DnD or similar |
| Multiple layout modes (sidebar icons vs top tabs) | Explicitly required in PROJECT.md | Med | Two distinct layout components; persisted preference |
| Update notification in-app | Users expect not to be surprised by breaking changes | Low | electron-updater; show banner when update available |

---

## Differentiators

Features Rambox/Franz users wish they had, or that create "this is the better app" moments.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Named service groups ("chat sets") | Workspaces — switch between "Work" and "Personal" contexts instantly | Med | Filter sidebar by active group; persisted in config |
| DND schedule (time-based) | Set "quiet hours" so nights stay quiet | Low | Cron-style start/end time stored in settings; check on notification fire |
| Custom notification sound per service | WhatsApp gets a gentle chime; Slack gets the serious ping | Low | Play audio file on notification; path stored per service |
| Google sync for config | Use the same setup on a second machine without manual re-configuration | High | Google OAuth2 + cloud storage for config JSON; already in PROJECT.md scope |
| Keyboard shortcut: Ctrl+(1–9) to switch service | Power users navigate without mouse; Teams does this, users love it | Low | Register globalShortcut or in-window listener |
| Keyboard shortcut: Quick search/switcher (Ctrl+Shift+Space or Alt+Shift+K) | Rambox has this; highly praised | Low | Palette/modal overlay that filters services by name |
| Keyboard shortcut: Ctrl+Tab / Ctrl+Shift+Tab cycle | Familiar tab-switching muscle memory | Low | Map to service navigation |
| Focus mode (mute all temporarily with one click/key) | Deep work sessions; Alt+Shift+D in Rambox | Low | Toggle DND with keyboard shortcut |
| Service-level zoom (Ctrl+Plus/Minus) | WhatsApp fonts too small; some apps render small on hi-DPI | Low | webContents.setZoomFactor per service |
| Per-service hibernation (auto-sleep idle services) | Rambox's #1 performance feature; prevents memory bloat | Med | After N minutes of no focus on a service, destroy/unload WebContentsView; reload on tab select |
| Graceful unread badge even when service is hibernated | Unread count should survive hibernation | High | Store last-known count; restore on wake |
| Service-specific tray unread breakdown | Tray tooltip shows "WhatsApp: 3, Telegram: 1" | Low | Tray tooltip text built from per-service count store |

---

## Nice-to-Have (Post-MVP, not differentiators yet)

Features worth noting but not competitive requirements for v1.

| Feature | Value | Complexity | When to Add |
|---------|-------|------------|-------------|
| Spell check per language | QoL for multilingual users; Rambox paywalls this | Low | Free in Electron 8+ via Hunspell; just enable it. Note: Polish (for Gadu-Gadu users) needs Hunspell dictionary file |
| App lock / master password | Security for shared machines | Med | Electron screen-lock API + password dialog |
| Custom service via URL (beyond preset list) | Power users always want to add something custom | Low | URL-based custom service entry form |
| Per-service custom CSS injection | Advanced: make WhatsApp's font bigger without zoom | High | Inject via webContents.insertCSS on did-finish-load |
| Per-service custom JS injection | Advanced: auto-reload, hide ads | High | webContents.executeJavaScript — security risk; scope carefully |
| Mobile view toggle per service | Some services have better mobile UIs | Low | Custom user-agent string per service |
| Notification privacy (hide message preview) | Show "New message from WhatsApp" not message content | Low | Intercept notification title/body before showing |
| In-app Ctrl+F for current service | Rambox users complained this is missing | Med | Pass find event to focused WebContents; webContents.findInPage |
| Back/forward navigation (Alt+Left/Right) | Browser muscle memory | Low | webContents.goBack/goForward |

---

## Anti-Features

Things that look good on paper but frustrate users in practice. Build none of these in v1.

### Anti-Feature 1: Paywalling core functionality
**What looks good:** Freemium model unlocks revenue
**What goes wrong:** Rambox's #1 complaint is that spell check, workspaces, and CSS injection require Pro ($5.83/mo). Users feel extorted for features that feel basic. Ferdi/Ferdium gained users specifically by removing Rambox paywalls.
**What to do instead:** Offer all features free in v1. Monetize differently if needed (lifetime license, not subscription for core UX).

### Anti-Feature 2: Service hibernation that silences notifications
**What looks good:** Hibernate idle services to save RAM
**What goes wrong:** If hibernation stops notifications (Rambox's behavior), users miss messages. This is the worst possible outcome for a messaging app.
**What to do instead:** Keep notification-relevant services awake, or implement lightweight background polling. Only hibernate services the user explicitly marks as non-critical.

### Anti-Feature 3: Mandatory countdown / onboarding friction
**What looks good:** Onboarding flow to explain features
**What goes wrong:** Franz requires a 15-second countdown before use. Users cite this as annoying and it signals disrespect for the user's time.
**What to do instead:** No countdowns. Show a brief one-time tooltip overlay. Skip it on subsequent launches.

### Anti-Feature 4: Inaccurate/phantom unread badges
**What looks good:** Unread badges keep user informed
**What goes wrong:** Rambox users report badges showing unread counts when inboxes are empty. This trains users to distrust the app entirely.
**What to do instead:** Source unread count from the service's own page title (e.g., "(3) WhatsApp") rather than guessing from notification events. Include a per-service "clear badge" option.

### Anti-Feature 5: No notification center / unreliable notifications
**What looks good:** Native OS notifications for each service
**What goes wrong:** All-in-One Messenger was specifically criticized for missing a notification center and having unreliable notifications. If users can't trust that they'll get notified, they'll revert to individual apps.
**What to do instead:** Use Electron's Notification API (wraps OS notifications) per service. Log notifications in a simple in-app history panel.

### Anti-Feature 6: No global search across services
**What looks good:** Each service handles its own search
**What goes wrong:** Users expect to find "that link John sent me" without knowing which app it was in. Station and Shift are praised specifically for cross-service search.
**What to do instead:** Note for v2: global search is a major differentiator. In v1, do not block it architecturally (don't make WebContentsViews impossible to query).

### Anti-Feature 7: Single-link display (links opening in-place)
**What looks good:** Clicking a link opens it in the service pane
**What goes wrong:** Rambox users complained that clicking a new link replaces the current view with no way back. It destroys the service state.
**What to do instead:** All external links from services should open in the system default browser (shell.openExternal), not in the WebContentsView.

### Anti-Feature 8: Bloated service library / discovery UX
**What looks good:** 700+ services! More is better!
**What goes wrong:** Rambox's 700+ service list with no categorization becomes noise. Users only use 3–7 services.
**What to do instead:** Gradd has 7 defined services — ship those well. Add a clean "add custom" option. Skip the giant service marketplace entirely in v1.

---

## Feature Dependencies

```
Service isolation (partitioned WebContentsView) → Everything else
  → Unread badge scraping from document.title
  → Per-service notification toggle
  → Per-service sound
  → Hibernation
  → Session persistence

Notification pipeline → Tray icon unread count
  → DND mode (gates notification pipeline)
  → DND schedule (gates DND mode trigger)

Google sync → Service arrangement stored in JSON → Sync to cloud
  → Restores layout on new device (not sessions, just config)

Sidebar layout (icon bar) → Keyboard Ctrl+(1-9) navigation
  → Quick search palette

Named service groups → Workspace switching → Filtered sidebar view
```

---

## Service-Specific Embedding Notes

Critical findings affecting the feature set:

| Service | Web Version | Embedding Notes |
|---------|------------|-----------------|
| Messenger (Facebook) | Yes — messenger.com | Works; user agent may need Chrome spoof |
| WhatsApp | Yes — web.whatsapp.com | Works; needs Chrome user agent string, not Electron default |
| Telegram | Yes — web.telegram.org | Works cleanly |
| Slack | Yes — app.slack.com | Works cleanly |
| Instagram Direct | Yes — instagram.com | Works; DM accessible from web |
| Gadu-Gadu | Yes — gg.pl web interface | Works; Polish users login via gg.pl browser app |
| Signal | **NO web version** | Signal has no web interface by design (security decision). Cannot be embedded as WebView. Gradd must either (a) drop Signal from v1 supported services or (b) offer "launch external Signal app" shortcut instead of embedding |

**Signal is a blocked service for the WebView-embedding approach.** This is a hard constraint from Signal's architecture, not a Gradd limitation. The PROJECT.md lists Signal as a target service — this needs to be surfaced as a scoping decision before v1 ships.

---

## MVP Recommendation

Prioritize for v1 launch (minimum to feel complete):

1. All 6 embeddable services working (Messenger, WhatsApp, Telegram, Slack, Instagram, Gadu-Gadu)
2. Signal: "open in Signal app" launch shortcut — not embedded
3. Sidebar icon navigation + top tab layout (both modes)
4. Unread badge on sidebar icon + taskbar overlay
5. System tray with close-to-tray behavior
6. DND mode with schedule
7. Custom sound per service
8. Named service groups (chat sets)
9. Google sync for config
10. Launch at startup
11. Keyboard shortcuts: Ctrl+(1–9), Ctrl+Tab, Quick switcher palette, Focus mode toggle
12. Dark-first minimal UI throughout

Defer to v2:
- Global search across services (major feature, requires architecture work)
- Per-service CSS/JS injection (power user niche, security complexity)
- App lock / master password
- Notification history center
- In-app Ctrl+F per service

---

## Polished vs Janky: What Makes the Difference

Evidence-based observations from studying user feedback across Rambox, Franz, Station, and Texts reviews:

**Polished signals (builds trust):**
- Sidebar icon transitions are instant — no layout flash when switching services
- Unread badge count is accurate, not phantom
- Notifications fire reliably and match OS notification style
- Tray icon reflects real state (not "always red dot")
- Close button goes to tray with zero friction — no dialog asking "quit or tray?"
- First paint of a service after restart is fast (session was persisted, not re-loading from scratch)
- Dark mode is true dark, not gray-washed
- All text is crisp on Windows hi-DPI (no blurry Electron font rendering)

**Janky signals (erodes trust):**
- Service reloads its login page on every restart
- Unread badge stays lit after reading messages
- Clicking X quits the app completely (no tray)
- App freezes when switching between heavy services
- Notification fires but shows wrong service name or wrong count
- Settings changes don't persist after restart
- Layout jumps or flickers when loading a service

---

## Windows-Specific Expectations

| Behavior | User Expectation | Implementation Note |
|----------|-----------------|---------------------|
| Close button (X) | Minimize to tray, not quit | Intercept `close` event on BrowserWindow; hide window, keep tray |
| Tray double-click | Restore main window | `tray.on('double-click', ...)` |
| Tray right-click | Context menu: Show, DND toggle, Quit | Tray context menu |
| Taskbar icon | Shows total unread badge as overlay icon | BrowserWindow.setOverlayIcon with canvas-drawn number |
| Taskbar flash | Flash taskbar on new message (optional, not required) | BrowserWindow.flashFrame — offer as setting, not default |
| Startup | Appear in tray without stealing focus | setLoginItemSettings + start minimized/hidden |
| Alt+F4 | Should also go to tray (or respect a "quit" confirmation) | Same close event handler |
| Windows notifications | Native toast, not in-app popups | Electron Notification API integrates with Windows Action Center |
| Windows Focus Assist / DND | App should respect OS DND when active | Check if Windows DND is active before firing notification (advanced, v2) |

---

## Sources

- Rambox features page: https://rambox.app/features/
- Rambox notifications: https://rambox.app/features/notifications/
- Rambox keyboard shortcuts: https://support.rambox.app/support/solutions/articles/42000029371-shortcuts
- Rambox hibernation: https://support.rambox.app/support/solutions/articles/42000066414-how-to-hibernate-
- Rambox user reviews (Capterra): https://www.capterra.com/p/229189/Rambox/reviews/
- Ferdium features: https://ferdium.org/
- Signal no-web-version: https://aboutsignal.com/blog/signal-web/
- Signal in Rambox discussion: https://news.ycombinator.com/item?id=15597477
- Texts power user features: https://texts.com/
- XDA chat aggregators review: https://www.xda-developers.com/best-chat-aggregators/
- Zapier all-in-one messaging: https://zapier.com/blog/best-all-in-one-messaging-app/
- Electron taskbar badge: https://www.electronjs.org/docs/latest/tutorial/windows-taskbar
- Electron spellchecker: https://www.electronjs.org/docs/latest/tutorial/spellchecker
- GG/Gadu-Gadu web: https://en.gg.pl/
- Station unread badge request: https://community.getstation.com/t/show-a-badge-with-an-unread-notifications-counter-in-stations-taskbar-icon-have-a-badge-on-the-station-taskbar-icon/372
- Franz countdown frustration: https://www.xda-developers.com/best-chat-aggregators/
- WhatsApp user agent: https://github.com/qutebrowser/qutebrowser/issues/5210
