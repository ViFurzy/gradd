<div align="center">
  <img src="./docs/banner.png" alt="Gradd Banner" width="100%" />

  <br />
  <br />

  **Gradd** is a highly polished, modern Windows desktop application that aggregates your favorite messaging platforms into a single, unified interface. Built with performance and elegance in mind, Gradd isolates each service securely and offers seamless cloud synchronization.

</div>

<br />

## ✨ Features

- **Multi-Service Aggregation**: Seamlessly switch between WhatsApp, Telegram, Messenger, Slack, Instagram, and Gadu-Gadu.
- **Secure Isolation**: Each messaging service runs in its own sandboxed Chromium WebView to ensure privacy and security.
- **Cloud Synchronization**: Log in with Google to automatically back up and sync your layouts, settings, and Do Not Disturb schedules across multiple devices.
- **Local Backup & Restore**: Export and import your exact configurations locally.
- **Smart Do Not Disturb (DND)**: Schedule automatic quiet hours or manually mute all notifications across all services instantly.
- **Customizable Layouts**: Choose between a compact top Tab Bar or a detailed left Sidebar layout.
- **Auto-Updates**: Built-in seamless updater keeps your app up-to-date directly from GitHub releases.

<br />

<div align="center">
  <img src="./docs/screenshot.png" alt="Gradd UI Dashboard Mockup" width="90%" />
</div>

<br />

## 🚀 Tech Stack

- **Framework**: [Electron](https://electronjs.org/) + [React](https://reactjs.org/)
- **Bundler**: [Vite](https://vitejs.dev/) with `electron-vite`
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + Phosphor Icons
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Backend / Sync**: Firebase Auth & Firestore

## 🛠️ Getting Started

### Installation

1. Go to the [Releases](https://github.com/ViFurzy/gradd/releases) page.
2. Download the latest installer (`gradd-app-1.0.0-setup.exe`) or the Portable version.
3. Run the installer and you're good to go!

### Development Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/ViFurzy/gradd.git
cd gradd
npm install
```

Create a `.env` file in the root directory to enable Firebase Cloud Sync:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Run the development server:

```bash
npm run dev
```

Build the production app for Windows:

```bash
npm run build:win
```

## 🔒 Privacy & Security

Gradd takes your privacy seriously.
- All web sessions are heavily sandboxed using Electron's `WebContentsView`.
- We block third-party trackers, ad scripts, and unnecessary background polling.
- Cloud Sync securely stores only your layout preferences, not your messages or credentials.

## 📄 License

MIT License
