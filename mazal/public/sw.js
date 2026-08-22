// Service Worker for Mazal POS - Offline & Cache Engine
const CACHE_NAME = "mazal-pos-v4-clean";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json"
];

// 1. Install Event - Pre-cache Core Shell safely
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => cache.add(url).catch(() => {}))
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
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Cache-First for static assets, Network-First for dynamic endpoints
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Bypass non-GET, API calls or cross-origin external requests
  if (
    request.method !== "GET" || 
    request.url.includes("api.php") || 
    request.url.includes("supabase.co") ||
    request.url.includes("/api/")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Refresh cache in background
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});

        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(async () => {
        // Fallback for navigation requests
        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline", { status: 503, statusText: "Service Unavailable Offline" });
      });
    }).catch(() => {
      return new Response("Offline", { status: 503, statusText: "Service Unavailable Offline" });
    })
  );
});
