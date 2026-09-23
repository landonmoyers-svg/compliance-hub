/*
  Compliance Hub service worker.
  Minimal by design: it exists to make the app installable (a fetch handler is
  required for the install prompt) and to show a friendly offline page for page
  navigations. It deliberately does NOT cache app data — this is an auth-gated,
  data-heavy app, so navigations are network-first and only fall back to an
  offline notice when the device is truly offline.
*/
const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — Compliance Hub</title>
<style>
  html,body{height:100%;margin:0}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#121212;color:#fff;display:grid;place-items:center;text-align:center;padding:1.5rem}
  .c{max-width:22rem}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{color:#9aa4b2;line-height:1.5;margin:0 0 1.25rem}
  button{background:#1f8fff;color:#fff;border:0;border-radius:.5rem;padding:.6rem 1.1rem;font-size:.95rem;cursor:pointer}
</style></head>
<body><div class="c">
  <h1>You're offline</h1>
  <p>Compliance Hub needs an internet connection. Reconnect and try again.</p>
  <button onclick="location.reload()">Retry</button>
</div></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

/*
  Emergency Alert push. The server sends {title, body, tag, url, urgent}; we
  show it even when no Hub tab is open. requireInteraction keeps it on screen
  until someone acts; renotify makes a repeat alert for the same incident
  (e.g. "evacuate now") vibrate and sound again.
*/
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Compliance Hub", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Emergency alert";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "emergency",
      renotify: !!data.urgent,
      requireInteraction: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [300, 150, 300, 150, 600],
      data: { url: data.url || "/emergency" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/emergency", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin)) { w.focus(); return w.navigate(url); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
