/**
 * Cash Logger service worker.
 *
 * Strategy: stale-while-revalidate for the app's own files. A launch is served
 * instantly from cache (same speed as offline), and in the background the file
 * is re-fetched from the network and the cache refreshed — so an update pushed
 * to GitHub is picked up silently and shows on the *next* launch, with no manual
 * cache-clearing and no launch-time slowdown.
 *
 * This only governs the four static shell files. Every call to Google Apps
 * Script is skipped (POSTs, and anything cross-origin), so saving, loading,
 * renaming and export always go straight to the network, untouched.
 */

// Bump this string on any change that must invalidate old caches. The activate
// step deletes every cache that is not the current one.
const CACHE = 'cash-logger-v2';

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
  // and cross-origin (Google) traffic must always hit the network live.
  if (request.method !== 'GET') {
    return;
  }
  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        // Kick off a background refresh regardless of a cache hit. Only a valid
        // response replaces the cache, so a transient 404/500 can't poison it.
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached || cache.match('./index.html'));

        // Keep the worker alive until the background refresh settles.
        event.waitUntil(network.catch(() => {}));

        // Serve cache instantly when present; otherwise wait for the network.
        return cached || network;
      })
    )
  );
});
