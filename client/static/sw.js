/**
 * Service Worker for AI App Builder
 * No caching - CDN handles all caching
 * Only provides offline fallback page
 */

// Install event - skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing (no cache)...');
  self.skipWaiting();
});

// Activate event - clean up any old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating (no cache)...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // Delete ALL caches
        return Promise.all(
          cacheNames.map((name) => {
            console.log('[Service Worker] Deleting cache:', name);
            return caches.delete(name);
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - always use network, no caching
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }
  
  // Always fetch from network, show offline page only if network fails
  event.respondWith(
    fetch(request).catch(() => {
      // Only show offline page for navigation requests
      if (request.mode === 'navigate') {
        return caches.match('/offline.html').then(response => {
          if (response) return response;
          // Fallback if offline page not cached
          return new Response('Offline - Please check your connection', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      }
      throw new Error('Network request failed');
    })
  );
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
    );
  }
});
