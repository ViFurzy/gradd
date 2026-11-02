// Preload injected into every (sandboxed) service WebContentsView.
// Exposes one function to the page world. The main process installs a window.Notification
// stub (via executeJavaScript, which bypasses page CSP) that calls it, so every web
// notification goes through Gradd: DND gating, a per-service rate limit, and an immediate
// unread rescrape. See 'service-notification' in src/main/index.ts.

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__graddNotify', (title: unknown, body: unknown): void => {
  ipcRenderer.send('service-notification', { title: String(title), body: String(body) })
})
