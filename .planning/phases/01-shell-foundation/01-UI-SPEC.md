---
phase: 1
slug: shell-foundation
status: draft
shadcn_initialized: false
preset: none
created: 2026-06-17
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for the Gradd shell: the persistent window frame, dual layout modes (sidebar and tab bar), and system tray integration. No service content appears in this phase — the contract covers the chrome only.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none — hand-rolled Tailwind utilities |
| Icon library | @phosphor-icons/react (Bold weight, 20px default) |
| Font | System stack — `ui-sans-serif, system-ui, -apple-system, sans-serif` |

**Rationale:** No components.json detected; project is not yet scaffolded. Tailwind 4 utilities are sufficient for a shell with two layout surfaces and a handful of interactive elements. shadcn initialization is deferred to Phase 5 (Service Management), when a settings panel justifies a full component library. System font stack avoids font loading overhead on app launch and matches Windows 11 native rendering expectations.

---

## Spacing Scale

Declared values (multiples of 4 only):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gap within a nav item, inline badge padding |
| sm | 8px | Padding inside sidebar icon slots, tab label padding |
| md | 16px | Section padding within the shell header or tray area |
| lg | 24px | Sidebar width padding, space between layout regions |
| xl | 32px | Reserved — not used in Phase 1 |
| 2xl | 48px | Reserved — not used in Phase 1 |
| 3xl | 64px | Reserved — not used in Phase 1 |

**Exceptions:**
- Sidebar icon slots: minimum 44px tall (touch/click target floor) — this overrides the sm/md rhythm for hit-target compliance
- Top tab bar height: 40px (compact, desktop-only — no 44px floor needed for a horizontal bar with ample pointer area)
- Window drag region (custom titlebar): 32px tall

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 (regular) | 1.5 |
| Label | 12px | 400 (regular) | 1.4 |
| Heading | 16px | 600 (semibold) | 1.2 |
| Caption | 11px | 400 (regular) | 1.3 |

**Notes:**
- Body: used in tray menu items and any future tooltip content
- Label: used in tab bar service names, sidebar tooltips — size contrast (12px vs 14px) provides hierarchy without a separate weight
- Heading: used in section titles within settings panels (Phase 5+), pre-declared now for token consistency
- Caption: used for keyboard shortcut hints and status text
- No display size in Phase 1 — this is application chrome, not marketing content
- Weights restricted to 400 and 600 only — no intermediate weight to keep the shell visually quiet

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0f0f11` | Window background, main content area behind service views |
| Secondary (30%) | `#1a1a1f` | Sidebar background, tab bar background, tray region |
| Accent (10%) | `#6e6ef5` | Active service indicator dot, focused tab underline, active sidebar icon fill |
| Destructive | `#e5534b` | "Quit" label in tray context menu only |

**Accent reserved for:**
1. The active service indicator in sidebar mode (2px left border strip on the active icon slot)
2. The active tab underline in tab bar mode (2px bottom border on the selected tab)
3. Keyboard focus ring on interactive shell elements

Accent is NOT used for: hover states, icon fills, general buttons, or backgrounds.

**Supporting tokens (not in the 60/30/10 table but required for implementation):**

| Token | Value | Usage |
|-------|-------|-------|
| Surface border | `rgba(255,255,255,0.07)` | Hairline separator between sidebar and content area, between tab bar and content area |
| Text primary | `#e8e8ec` | Nav labels, tray menu primary items |
| Text muted | `#6b6b78` | Inactive tab labels, sidebar tooltip text |
| Icon default | `#6b6b78` | Inactive service icons |
| Icon active | `#e8e8ec` | Active service icon (fills to near-white, accent strip provides color identity) |
| Hover surface | `rgba(255,255,255,0.05)` | Sidebar icon slot hover state, tab hover state |
| Active surface | `rgba(110,110,245,0.12)` | Active sidebar icon slot background (accent at 12% opacity) |

**Dark-first by design.** No light mode in Phase 1. Light mode is deferred (not in v1 scope). The `dominant` and `secondary` values are OLED-friendly near-blacks with a cool-blue undertone to match a modern Windows 11 dark environment.

No warm grays, no beige, no cream. The "app that actually looks good" goal targets Linear/Notion desktop aesthetic — cool dark neutral with a single restrained accent.

---

## Layout Modes

Phase 1 must implement both layout modes concurrently and persist the choice via electron-store.

### Mode A: Left Sidebar Icon Bar

```
+--+-------------------------------------------+
|  |                                           |
|S |       Content area                        |
|I |       (WebContentsView host region)       |
|D |       Empty in Phase 1 —                 |
|E |       "No services yet" placeholder       |
|B |                                           |
|A |                                           |
|R |                                           |
+--+-------------------------------------------+
```

- Sidebar width: 56px (fixed, not resizable in Phase 1)
- Icon slots: 56px wide × 44px tall, centered icon at 20px
- Active indicator: 2px left border in accent color, `border-radius: 0 2px 2px 0` on the strip
- Active slot background: `active-surface` token
- Hover state: `hover-surface` token, 150ms ease transition on background-color only
- Bottom of sidebar: reserved 56px × 56px zone for future "Add Service" button (Phase 5)

### Mode B: Top Horizontal Tab Bar

```
+----------------------------------------------+
| [Tab 1] [Tab 2] [Tab 3]                      |
+----------------------------------------------+
|                                              |
|       Content area                           |
|       (WebContentsView host region)          |
|       Empty in Phase 1 —                    |
|       "No services yet" placeholder          |
|                                              |
+----------------------------------------------+
```

- Tab bar height: 40px
- Tab item: service icon (16px) + service label (Label size, 12px 400) + 16px horizontal padding per side
- Active tab: 2px bottom border in accent color
- Hover state: `hover-surface` token background, 150ms ease
- Tabs do not wrap — horizontal scroll if content overflows (Phase 5 concern, pre-declared here)

### Layout toggle

- Mechanism: not a modal — a toggle in the custom titlebar or a tray menu item
- The layout preference key in electron-store: `layout.mode` — values: `"sidebar"` | `"tabs"`
- Default on first launch: `"sidebar"`

### Custom Titlebar

- Height: 32px, `app-region: drag` covering the full width
- Background: matches `secondary` token
- Right side: standard Windows system buttons (minimize, maximize, close) — use Electron's `frame: false` + custom rendering OR `titleBarStyle: 'hidden'` with `titleBarOverlay` — decision for implementer, both are valid; the visual contract is a 32px drag zone
- No custom buttons in the titlebar for Phase 1 (no settings gear, no layout toggle in the bar — those are Phase 5)

---

## Empty State

Phase 1 delivers a shell with no services yet. The content area must show a composed empty state.

| Element | Value |
|---------|-------|
| Heading | "No services added yet" |
| Body | "Services will appear here. Add them in settings." |
| Body size | Body (14px, 400) |
| Heading size | Heading (16px, 600) |
| Colors | Heading: `text-primary`. Body: `text-muted`. |
| Alignment | Centered vertically and horizontally in the content area |
| Icon | Phosphor `ChatCircleDots` at 40px, `icon-default` color |

No CTA button in the empty state for Phase 1 — "settings" does not exist yet. The body line is informational copy pointing toward a future flow.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | Not applicable — Phase 1 has no primary CTA |
| Empty state heading | "No services added yet" |
| Empty state body | "Services will appear here. Add them in settings." |
| Tray menu: show action | "Show Gradd" |
| Tray menu: hide action | "Hide Gradd" |
| Tray menu: DND placeholder | "Do Not Disturb" (grayed out, non-interactive — placeholder only) |
| Tray menu: quit action | "Quit" |
| Layout toggle label (sidebar) | "Switch to Tabs" |
| Layout toggle label (tabs) | "Switch to Sidebar" |

**Copy rules:**
- No em-dashes anywhere
- No "Seamless", "Unified", "Powerful", or other filler adjectives
- Tray menu items use title case
- No ellipsis (`...`) on menu items unless a confirmation dialog follows (none do in Phase 1)
- "Quit" is red (`destructive` token) in the tray menu to signal a terminal action — no confirmation dialog needed (standard desktop app behavior)

---

## Interaction States

### Sidebar Icon Slot

| State | Visual |
|-------|--------|
| Default | Icon: `icon-default` color. Background: transparent. |
| Hover | Background: `hover-surface`. Icon: stays `icon-default`. Transition: 150ms ease on background-color. |
| Active (current service) | Background: `active-surface`. Icon: `icon-active`. Left border: 2px `accent` color. |
| Focus (keyboard) | 2px `accent` focus ring, `border-radius: 4px`, `outline-offset: 2px` |

### Tab Item

| State | Visual |
|-------|--------|
| Default | Label: `text-muted`. Background: transparent. |
| Hover | Background: `hover-surface`. Label: `text-primary`. Transition: 150ms ease. |
| Active | Label: `text-primary`. Bottom border: 2px `accent`. |
| Focus (keyboard) | 2px `accent` focus ring |

### Tray Context Menu

Rendered by Electron's native `Menu.buildFromTemplate` — no custom styling needed. The `destructive` token informs the "Quit" item's label choice, not a CSS color (native menu items cannot be styled in Electron's native Menu on Windows).

---

## Window Behavior Contract

| Behavior | Specification |
|---------|---------------|
| Close button (`X`) | Calls `win.hide()`, not `app.quit()`. App remains in tray. |
| Tray icon double-click | Calls `win.show()` and `win.focus()`. |
| Tray right-click | Shows context menu with: DND (grayed), Show/Hide, Quit. |
| "Show Gradd" tray item | `win.show()` + `win.focus()`. Label changes to "Hide Gradd" when window is visible. |
| "Hide Gradd" tray item | `win.hide()`. |
| "Quit" tray item | `app.quit()`. |
| App launch (fresh) | Window opens at last-saved bounds (electron-store). Default: 1200×800, centered. Minimum: 800×600. |
| Window state persistence | `x`, `y`, `width`, `height`, `maximized` persisted to electron-store key `window.bounds`. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none — shadcn not initialized in Phase 1 | not applicable |
| Third-party | none | not applicable |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
