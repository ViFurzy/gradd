<div align="center">
  <img src="./docs/repo_header.png" alt="Gradd" width="100%" />
  <br /><br />
  <p><strong>All your messaging apps in one place — the app Rambox should have been.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square&logo=windows" alt="Platform" />
    <img src="https://img.shields.io/badge/electron-39.x-47848F?style=flat-square&logo=electron" alt="Electron" />
    <img src="https://img.shields.io/badge/react-19.x-61DAFB?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/typescript-5.x-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  </p>
</div>

---

Gradd is a Windows desktop application that aggregates multiple messaging platforms — Messenger, WhatsApp, Telegram, Slack, Instagram, and Gadu-Gadu — into a single polished interface. Each service runs in its own fully isolated Chromium session, so logins never bleed between tabs and notifications fire independently per service.

## Screenshots

<div align="center">
  <img src="./docs/screenshot-services.png" alt="Services Directory" width="80%" />
  <br /><br />
</div>

## Features

- **Multi-service aggregation** — Switch between WhatsApp, Telegram, Messenger, Slack, Instagram, and Gadu-Gadu from a unified sidebar or tab bar.
- **Complete session isolation** — Every service uses its own Chromium partition (`persist:service-<id>`), so cookies, storage, and credentials are fully sandboxed.
- **Google Cloud Sync** — Log in with your Google account to sync your layout, service order, and DND schedule across devices via Firestore.
- **Local Backup & Restore** — Export and import your full configuration as a JSON file without cloud credentials.
- **Do Not Disturb** — Toggle DND manually or set a recurring schedule (supports midnight wrap). Mutes all audio and blocks OS notifications while active.
- **Per-service mute** — Mute audio for individual services independently of DND.
- **Unread badges** — Live unread count badges on each service icon and a Windows taskbar overlay.
- **Native notifications** — OS-level toast notifications via the Windows Action Center when a service fires a web notification.
- **Auto-updates** — Seamless updater powered by `electron-updater` and GitHub Releases.
- **Dual layouts** — Compact top tab bar or a detailed left sidebar; choice persists across restarts.
- **Drag-to-reorder** — Drag service icons to rearrange them in your preferred order.
- **System tray** — Minimise to the tray and keep everything running in the background.

## Installation

Download the latest release from the [Releases](https://github.com/ViFurzy/gradd/releases) page.

| Package | Description |
|---------|-------------|
| `gradd-app-x.x.x-setup.exe` | NSIS installer — recommended, creates Start Menu shortcut |
| `gradd-app-x.x.x.exe` | Portable — no install needed, runs from any folder |

> **Note:** Windows may show a SmartScreen warning on first launch because the binary is not EV code-signed yet. Click **More info → Run anyway** to proceed.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22.x or newer
- Windows 10/11 (primary dev target)

### Setup

```bash
git clone https://github.com/ViFurzy/gradd.git
cd gradd
npm install
```

### Run in dev mode

```bash
npm run dev
```

This starts the Vite dev server for the renderer with HMR and launches Electron with hot-reload for the main process.

> **Important:** Any new `ipcRenderer.invoke` calls added to `src/preload/index.ts` require a full restart of the dev server (`Ctrl+C` then `npm run dev`) to take effect.

### Build for Windows

```bash
npm run build:win
```

Outputs an NSIS installer and portable exe to `dist/`.

## Architecture

```
src/
├── main/
│   ├── index.ts      # App entry, IPC handlers, WebContentsView management, DND, tray
│   ├── store.ts      # electron-store config schema, defaults, migrations
│   ├── auth.ts       # Google OAuth2 PKCE flow + safeStorage token encryption
│   └── firebase.ts   # Firestore cloud sync
├── preload/
│   ├── index.ts      # contextBridge API surface + HTML5 Notification interception
│   └── index.d.ts    # TypeScript declarations for window.api
└── renderer/
    └── src/
        ├── App.tsx               # Main UI (sidebar + tab layouts, directory, settings)
        ├── main.tsx              # React 19 entry point
        └── store/useLayoutStore.ts  # Zustand global state
```

### Key architectural decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| WebView API | `WebContentsView` + `BaseWindow` | `BrowserView` deprecated since Electron 30 |
| Session isolation | `persist:service-<uuid>` per view | Cookies / storage never cross service boundaries |
| Google OAuth | PKCE + loopback `http.createServer` | Google blocks OAuth in embedded Chromium |
| Token storage | `safeStorage.encryptString()` → electron-store | Refresh token never stored in plaintext |
| State management | Zustand 5 | Sub-1KB, no Provider boilerplate, slices pattern |
| Build tooling | electron-vite | Single config, instant HMR, better DX than electron-forge |
| Installer | NSIS | Squirrel.Windows deprecated in electron-builder |

## Configuration

Gradd stores configuration in the OS user-data directory:

- **Windows:** `%APPDATA%\gradd-app\config.json`

The schema covers: `layout`, `services`, `dnd`, `auth` (encrypted refresh token), `general`, and `window.bounds`.

## Privacy & Security

- Messages and credentials are **never** sent to any Gradd server — all message data stays in Chromium's local partition storage.
- Cloud Sync stores only layout preferences (service list, DND schedule, layout mode) — no message content.
- Google OAuth uses the PKCE flow with a loopback server on an OS-assigned port; no client secret is required for the native-app flow.
- The Google refresh token is encrypted using the OS keyring via Electron's `safeStorage` API before being written to disk.
- Service WebContentsViews run with `sandbox: true` — Chromium renderer exploits are contained and cannot reach Node.js.
- The `import-config` handler validates the schema and rejects any file whose service URLs use non-http(s) schemes.

### Required: Firestore Security Rules

The Firebase API key ships inside the app bundle (this is standard for client-side Firebase — security is enforced by rules, not key secrecy). You **must** configure Firestore rules to restrict access to authenticated users only.

Go to [Firebase Console](https://console.firebase.google.com/) → Firestore Database → Rules and set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Tech Stack

| Technology | Version | Role |
|------------|---------|------|
| Electron | 39.x | Desktop runtime, Chromium WebContentsView |
| React | 19.x | UI framework |
| TypeScript | 5.x | End-to-end type safety |
| Tailwind CSS | 4.x | Styling |
| Zustand | 5.x | Client state management |
| electron-vite | 5.x | Build orchestrator + HMR |
| electron-builder | 26.x | Packaging + NSIS installer |
| electron-store | 11.x | Local config persistence |
| electron-updater | 6.x | Auto-update delivery |
| Firebase | 12.x | Google Auth + Firestore sync |

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss the approach.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Commit your changes: `git commit -m "feat: describe the change"`
4. Push and open a Pull Request

## License

[MIT](LICENSE) — made by [ViFurzy](https://vi-design.pro)
