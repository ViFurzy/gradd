# Gradd - Development Handover

This document summarizes the recent architectural changes, feature implementations, and the current state of the Gradd repository as of **Phase 8 Completion**.

## 1. UI & Theming Refinements
- **Color Palette Enforced**: The application fully adheres to the sleek dark theme defined in `src/renderer/src/assets/main.css`.
  - Dominant Background: `#0f0f11`
  - Secondary/Sidebar: `#1a1a1f`
  - Accent Color: `#6e6ef5` (Indigo)
  - Text Primary: `#e8e8ec`
- **Services Added**: `Instagram` (formerly Instagram Direct) and `Gadu-Gadu` have been fully integrated with custom vector icons inside both the sidebar/topbar layouts and the Services Directory.
- **Config Migration**: A silent migration hook has been added to `src/main/store.ts` to automatically rename any stored `Instagram Direct` configurations to `Instagram` so existing user databases don't break.

## 2. Configuration Export, Import & Reset
- **Local Backup & Restore**: Added an entire section to the `SettingsPanel` in `App.tsx` for exporting and importing layouts.
- **IPC Handlers (`src/main/index.ts`)**: 
  - `export-config`: Uses standard OS file dialogs to export `store.json`.
  - `import-config`: Imports an existing JSON configuration, applies it to the store, and seamlessly soft-restarts the Electron app to apply changes.
  - `clear-config`: Fully resets the internal `electron-store` settings (useful for logging out or clearing setups).

## 3. Google Authentication Overhaul
- **Native Login Popup (`src/main/auth.ts`)**: Replaced `shell.openExternal` (which launched the user's default browser) with an embedded, strictly scoped Electron `BrowserWindow`. A standard Chrome user-agent spoof is applied to circumvent Google's `disallowed_useragent` security block on embedded webviews.
- **Native Profile Menu**: Replaced the React DOM absolute-positioned Google profile dropdown with a Native OS Context Menu via `Menu.buildFromTemplate`. 
  - *Why?* Because Electron's `WebContentsView` (used to display Messenger/WhatsApp/etc) inherently renders on top of the DOM. A DOM-based popup would get hidden underneath active service tabs. The native IPC menu (`show-profile-menu`) perfectly overlaps the webviews.

## 4. GitHub Setup & Security
- **Screenshots & Assets**: `README.md` has been cleaned up (removing raw dev instructions) and beautifully formatted with three accurate visual showcases: Settings, Sidebar Directory, and Topbar Directory.
- **Secrets Management**: Discovered `.env` leaking Firebase credentials to GitHub. Stripped `.env` from Git tracking history, added it to `.gitignore`, and resolved the GitHub Secret Scanning push block.

## Current Architecture Flow
- **State Management**: Handled heavily by `Zustand` (`src/renderer/src/store/useLayoutStore.ts`), which acts as the bridge between React components and Electron IPC handles (`window.api`).
- **Main/Renderer Bridge**: Always remember that any new `ipcRenderer.invoke` calls added to `src/preload/index.ts` **require a hard restart of the Vite Dev Server** (`npm run dev`) to take effect, otherwise React will throw `is not a function` reference errors.

## Next Steps / Future Work
- The base application is extremely stable. Focus can now shift to adding more messaging providers (Discord, Teams, etc.), further expanding the cloud-sync capabilities to encompass general configuration traits, or setting up the CI/CD pipeline via GitHub Actions for automated executable builds.
