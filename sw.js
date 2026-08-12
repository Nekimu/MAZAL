// Service Worker for Mazal POS - Offline & Cache Engine
const CACHE_NAME = "mazal-pos-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json"
];

// 1. Install Event - Pre-cache Core Shell safely
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[PWA Service Worker] Pre-caching app shell");
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => cache.add(url).catch((err) => console.warn("Cache add failed for:", url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[PWA Service Worker] Removing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Cache-First for static assets, Network-First for API/Firebase
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Skip non-GET, API endpoints, or external Firebase WS requests
  if (
    request.method !== "GET" || 
    request.url.includes("api.php") || 
    request.url.includes("firestore.googleapis.com") || 
    request.url.includes("identitytoolkit")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update to refresh cache
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {/* Offline - keep cached response */});

        return cachedResponse;
      }

      // If not in cache, fetch from network and store in cache
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback to index.html for navigation requests when offline
        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
