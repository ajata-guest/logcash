/**
 * Cash Logger service worker.
 *
 * Strategy: NETWORK-FIRST for the app's own files. When online, every launch
 * fetches the latest file from GitHub (its CDN is fast) and refreshes the cache,
 * so an update shows up immediately — no "one launch behind" lag and no manual
 * cache-clearing. The cache is only a fallback for when the network is slow or
 * offline, so the app still opens with no connection.
 *
 * This only governs the static shell files. Every call to Google Apps Script is
 * skipped (POSTs, and anything cross-origin), so saving, loading, and export
 * always go straight to the network, untouched.
 */

// Bump on any change that must invalidate old caches. The activate step deletes
// every cache that is not the current one.
const CACHE = 'cash-logger-v3';

// How long to wait for the network before falling back to the cached copy, so a
// flaky connection doesn't stall the launch.
const NETWORK_TIMEOUT_MS = 4000;

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
    caches.open(CACHE).then((cache) => {
      // Race the network against a short timer. Whichever settles first wins;
      // a slow/offline network, or a transient non-OK reply, falls back to cache.
      const network = fetch(request).then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
          return response;
        }
        return null; // treat a non-OK response as a miss
      });

      const timeout = new Promise((resolve) => {
        setTimeout(function () { resolve(null); }, NETWORK_TIMEOUT_MS);
      });

      return Promise.race([network.catch(() => null), timeout])
        .then((response) => {
          if (response) {
            return response;
          }
          // Network too slow or failed — serve cache, and let the real fetch
          // keep going in the background to refresh the cache for next time.
          event.waitUntil(network.catch(() => {}));
          return cache.match(request).then((cached) => cached || cache.match('./index.html'));
        });
    })
  );
});
