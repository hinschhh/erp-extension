/* 
  public/sw.js
  Minimaler Service Worker für PWA:
  - Precache von Kern-Assets
  - NetworkFirst für HTML/Navigations-Requests (immer aktuelle App)
  - CacheFirst für statische Assets (schnell)
  - Stale-While-Revalidate für externe Ressourcen (z. B. Fonts)
*/

const CACHE_VERSION = "v1.0.0";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Passe die Pfade an deine Assets an:
const PRECACHE_URLS = [
  "/",                 // Start
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-icon-512x512.png"
];

// Utility: Request-Typen erkennen
const isNavigationRequest = (req) =>
  req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));

const isSameOrigin = (url) => self.location.origin === url.origin;

const isStaticAsset = (url) => {
  // Erweiterbar: füge Endungen hinzu, die du cache-first ausliefern willst
  return [".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff2", ".woff", ".ttf"]
    .some((ext) => url.pathname.endsWith(ext));
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting(); // sofort aktiv werden
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Strategien
const networkFirst = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fallback: versuche Startseite, wenn HTML
    if (isNavigationRequest(request)) {
      const precachedRoot = await caches.match("/");
      if (precachedRoot) return precachedRoot;
    }
    throw err;
  }
};

const cacheFirst = async (request) => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  cache.put(request, fresh.clone());
  return fresh;
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((fresh) => {
      cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => undefined);
  return cached || networkPromise || fetch(request);
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1) HTML / Navigations-Requests -> NetworkFirst
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2) Gleiche Origin & statische Assets -> CacheFirst
  if (isSameOrigin(url) && isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3) Externe Ressourcen (z. B. Fonts/CDNs/Supabase-Storage) -> Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Optional: Steuerbare Updates (kannst du auslösen, um neuen SW sofort zu aktivieren)
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
