var CACHE_NAME = 'invoiceflow-cache-v1';
var ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/logo.svg',
  
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp5GP35D.woff2',
  
  // CDNs
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js'
];

// Install Event - Pre-cache essential resources
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[Service Worker] Pre-caching offline shell and assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

// Activate Event - Clean up deprecated caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing deprecated cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch Event - Dynamic caching fallback to network (Cache-First for static assets)
self.addEventListener('fetch', function(event) {
  // Only intercept HTTP/HTTPS GET requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('https://')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // Serve from cache but fetch fresh version in the background (Stale-While-Revalidate)
          fetch(event.request)
            .then(function(networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(function(cache) {
                  cache.put(event.request, networkResponse);
                });
              }
            }).catch(function() {
              // Ignore background fetch failures (e.g. if offline)
            });
          return cachedResponse;
        }

        // Cache miss: fetch from network
        return fetch(event.request)
          .then(function(networkResponse) {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !event.request.url.startsWith('https://')) {
              return networkResponse;
            }
            
            // Dynamic caching: cache newly requested external libraries
            var responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseToCache);
            });
            return networkResponse;
          })
          .catch(function(err) {
            // Offline fallbacks
            console.log('[Service Worker] Fetch failed; returning offline fallback if available.', err);
            return caches.match('./index.html');
          });
      })
  );
});
