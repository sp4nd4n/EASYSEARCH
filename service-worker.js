/**
 * EASYSEARCH — service worker
 * Caches the app shell so the interface still opens offline.
 * Actual PDF generation still needs a connection (to fetch the topic
 * content from Wikipedia), but the app UI itself will load instantly.
 */
const CACHE_NAME = "easysearch-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/storage.js",
  "./js/auth.js",
  "./js/content.js",
  "./js/pdf.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Never intercept the Wikipedia/Google/CDN calls — only serve app-shell files from cache.
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => cached);
    })
  );
});
