# Phase 1: Shell Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-06-18
**Phase:** 01-shell-foundation
**Mode:** discuss
**Areas discussed:** Window chrome approach

---

## Gray Areas Presented

| Area | Selected? |
|------|-----------|
| Window chrome approach | Yes |
| Layout toggle placement | No |
| Project scaffold | No |

## Discussion: Window Chrome Approach

### Q1 — Titlebar approach
**Options:** titleBarStyle: 'hidden' + native overlay / frame: false + custom HTML buttons
**Answer:** `titleBarStyle: 'hidden'` + native overlay (Recommended)
**Notes:** Native Win11 system buttons, no custom button HTML or IPC wiring needed.

### Q2 — TitleBarOverlay height
**Options:** Set height: 32 explicitly / Leave at OS default
**Answer:** Set height: 32
**Notes:** Matches UI-SPEC 32px drag region spec. Consistent across Windows versions.

### Q3 — Mica material
**Options:** No — solid dark only / Yes — Mica on Windows 11
**Answer:** Yes — Mica on Windows 11
**Notes:** `transparent: true` + `backgroundMaterial: 'mica'`. Graceful fallback on Win10. Aligns with "the app that actually looks good" differentiator.

### Q4 — Mica scope
**Options:** Content area only / Entire window including sidebar/tab bar
**Answer:** Content area only — sidebar/tab bar stay solid
**Notes:** Solid sidebar/tab bar required for predictable color token rendering and interaction states.

---

## Decisions Not Discussed (user did not select these areas)

- **Layout toggle placement** — not selected. UI-SPEC excludes it from titlebar for Phase 1; tray menu is the natural home if implementer adds it, but it's not a Phase 1 requirement.
- **Project scaffold** — not selected. Claude's discretion: electron-vite template is the recommended starting point per CLAUDE.md.

---

## Deferred Ideas

None raised during discussion.
