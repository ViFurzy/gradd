// Preload injected into every service WebContentsView.
// Intercepts window.Notification so Gradd can:
//   1. Trigger an immediate unread-count rescrape the moment a message arrives
//      (title-first — no DOM touching if Telegram/Messenger already set the title).
//   2. Route the notification through the DND gate in the main process.

import { ipcRenderer } from 'electron'

// Inject into the page world (isolated from preload world due to context isolation)
const interceptScript = `
(function() {
  if (window.__graddBridge) return;
  window.__graddBridge = true;
  var _Orig = window.Notification;
  if (!_Orig) return;
  function GraddNotif(title, opts) {
    window.dispatchEvent(new CustomEvent('__gradd_notif', {
      detail: { title: String(title), body: (opts && opts.body) ? String(opts.body) : '' }
    }));
    return new _Orig(title, opts);
  }
  GraddNotif.requestPermission = _Orig.requestPermission.bind(_Orig);
  Object.defineProperty(GraddNotif, 'permission', { get: function() { return _Orig.permission; } });
  window.Notification = GraddNotif;
})();
`

function inject(): void {
  const s = document.createElement('script')
  s.textContent = interceptScript
  document.documentElement.appendChild(s)
  s.remove()
}

// Run as early as possible so the override is in place before page scripts load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject)
} else {
  inject()
}

window.addEventListener('__gradd_notif', (e: Event) => {
  const { title, body } = (e as CustomEvent<{ title: string; body: string }>).detail
  // Fire-and-forget: main process rescrapes + handles DND
  ipcRenderer.send('service-notification', { title, body })
})
