// Service Worker for Bible Study PWA
// Provides offline capability by caching resources

const CACHE_VERSION = 'v1';
const CACHE_NAME = `bible-study-${CACHE_VERSION}`;

// Precache: index.html, manifest.webmanifest, the CSS/JS already in index.html, 
// theology/commentary.json, and any xrefs we created
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  'https://cdn.tailwindcss.com',
  '/theology/commentary.json',
  '/xrefs/John.json',
  '/xrefs/Psalms.json',
  '/xrefs/John-3-16.json'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell and resources');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .catch((error) => {
        console.error('[SW] Precaching failed:', error);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('bible-study-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate strategy for dynamic content
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.log('[SW] Network fetch failed:', error);
    return null;
  });

  // Return cached response immediately if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}

// Fetch event - serve from cache with different strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Runtime cache (stale-while-revalidate) for /bibles/** and /xrefs/**
  if (url.pathname.startsWith('/bibles/') || url.pathname.startsWith('/xrefs/')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // For precached assets, serve from cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200) {
            return response;
          }

          // Cache successful responses for same-origin requests
          if (url.origin === location.origin) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        }).catch(() => {
          // Network failed and no cache available
          console.log('[SW] Network failed, no cache for:', event.request.url);
          // Return index.html for document requests to handle offline navigation
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Message event - for communication with the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
