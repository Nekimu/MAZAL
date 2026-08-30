// Service Worker for Mazal POS & ERP - 100% Localhost XAMPP & Apache
const CACHE_NAME = "mazal-pos-v25-clean-live";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json"
];

// 1. Install Event - Pre-cache Core Shell safely
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))
      );
    })
  );
});

// 2. Activate Event - Clean up all old caches immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Purging legacy cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Network-First for HTML/JS/CSS, Cache fallback for offline
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Bypass non-GET, PHP API calls, local backend or external sync endpoints
  if (
    request.method !== "GET" || 
    request.url.includes("api.php") || 
    request.url.includes("supabase.co") ||
    request.url.includes("localhost/MAZAL/api.php") ||
    request.url.includes("/api/")
  ) {
    return;
  }

  // Network-First strategy: Always fetch newest bundle from network if online
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback to cache if network fails
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html") || await caches.match("./");
          if (fallback) return fallback;
        }
        // Return transparent 404 instead of 503 to avoid crashing asset loaders
        return new Response("Resource not available in offline cache", { 
          status: 404, 
          statusText: "Not Found",
          headers: { "Content-Type": "text/plain" }
        });
      })
  );
});
