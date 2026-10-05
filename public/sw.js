/* KaloriAI service worker — minimal, safe caching strategy.
 * - Navigations: network-first, fallback to cached shell or offline page
 * - Static assets (hashed/immutable): cache-first
 * - API requests: never cached (always network)
 * - Web Push (VAPID): background notifications + click-to-open
 */
const CACHE = "kaloriai-v2";
const PRECACHE = [
  "/",
  "/offline.html",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls or file uploads/downloads
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: network-first with offline fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put("/", copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match("/")
            .then((shell) => shell || caches.match("/offline.html"))
            .then((hit) => hit || Response.error())
        )
    );
    return;
  }

  // Static, content-hashed assets: cache-first
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.svg" ||
    url.pathname.endsWith(".png");
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => {});
            return res;
          })
      )
    );
  }
});

/* ---------------- Web Push (VAPID) ---------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "KaloriAI", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "KaloriAI";
  const options = {
    body: data.body || "",
    tag: data.tag || "kaloriai",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === target && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
