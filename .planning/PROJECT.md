# Gradd — Desktop Chat Aggregator

## What This Is

Gradd is a Windows desktop application that aggregates multiple messaging platforms (Messenger, WhatsApp, Telegram, Slack, Instagram Direct, Signal, Gadu-Gadu) into a single polished interface. Each service runs in its own isolated Chromium WebView. Users log in with Google to sync their service configuration and preferences across devices.

## Core Value

All your messaging apps in one place, with a UI that actually looks good — the app Rambox should have been.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can add any supported service (Messenger, WhatsApp, Telegram, Slack, Instagram Direct, Signal, Gadu-Gadu) as a tab or sidebar icon
- [ ] Each service runs in its own isolated WebView — sessions don't bleed between services
- [ ] Service sessions persist locally on each device (no re-login on restart)
- [ ] User can choose service layout: horizontal tabs at top OR vertical icon bar on left
- [ ] User can create named service groups (chat sets) to organize their services
- [ ] User can log in with Google Account to sync workspace configs and app preferences
- [ ] Google sync stores: service arrangement, app settings, service display config
- [ ] Native Windows notifications for each service with unread badge on taskbar and tray icon
- [ ] User can assign a custom sound per service for incoming messages
- [ ] Do-not-disturb mode with schedule support
- [ ] Tray icon with service-level unread counts
- [ ] App notifies user when an update is available; user installs manually
- [ ] Dark-first minimal UI (Linear/Notion aesthetic)

### Out of Scope

- Mobile app — Windows desktop only, v1
- Service credential cloud sync — sessions are local-only; no QR code cloud backup
- Per-contact or per-keyword notification sounds — per-service sounds only in v1
- In-app messaging UI — services are embedded web apps, not native reimplementations
- OAuth-based service login via the app — user logs in via the embedded WebView as normal

## Context

- Reference app: Rambox (free, but dated UI, less polished)
- Primary differentiator: design quality — dark-first minimal aesthetic, thoughtful layout flexibility
- Target user: power user who lives in multiple messaging apps daily (personal use)
- Platform: Windows 11 (primary), Windows 10 compatible
- Services embed real web apps via Electron WebView/BrowserView — no API integrations needed; services authenticate via their own web login flows
- Google OAuth is only for the app's own config sync, not for any messaging service itself

## Constraints

- **Platform**: Windows desktop only — no macOS/Linux for v1
- **Engine**: Chromium (Electron) — services must be embeddable as web apps
- **Sessions**: Local persistence only — no cross-device session recovery (user must re-scan QR on new device)
- **Sync**: Google OAuth cloud sync for config only, not message data
- **Tech stack**: Electron + React shell + electron-store (local) + Google OAuth2 for cloud sync + electron-updater for updates

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron over Tauri | Full Chromium required for web app embedding (Tauri uses WebView2, not full Chromium) | — Pending |
| BrowserView per service | Isolation, independent session storage, webview partitioning | — Pending |
| Google OAuth for sync | User requested it; avoids building custom auth | — Pending |
| Local-only sessions | User chose simplicity over cross-device convenience | — Pending |
| Layout flexibility | User wants both top-tabs and left-icons as user preference | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-17 after initialization*
