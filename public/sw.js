// Service worker for ScanToContact.
//
// Vite fingerprints the built JS/CSS bundle filenames, so we can't list them
// by name ahead of time here. Instead:
//   - PRECACHE_URLS lists the fixed-path assets we know in advance (the HTML
//     shell, manifest, icons, and the OCR/barcode engine assets).
//   - Everything else same-origin is cached opportunistically the first time
//     it's fetched (stale-while-revalidate-ish: serve from cache instantly if
//     present, and always refresh the cache from the network in the
//     background), so the whole app shell ends up cached for offline use
//     after one normal visit.
const CACHE_NAME = "scan-to-contact-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/tesseract/worker.min.js",
  "/tesseract/tesseract-core-simd-lstm.wasm.js",
  "/tessdata/eng.traineddata.gz",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  // HTML navigations: prefer a fresh copy, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Everything else: cache-first, refreshing the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
