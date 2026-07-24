/**
 * Cash Logger service worker — caches the app shell so a cold launch works with
 * no network. The sync queue in Index.html handles the data side; this only
 * makes sure there is something to launch into.
 */

const CACHE = 'cash-logger-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Added one at a time: addAll() rejects the whole install if any single
      // URL 404s, and './' is not served everywhere.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never touch the Apps Script calls: POSTs must not be cached or replayed,
  // and a stale cached balance would be worse than none.
  if (request.method !== 'GET') {
    return;
  }
  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
