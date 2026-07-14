/*
  Zentrix Service Worker — PWA + Push Notifications v2.0
  Handles offline caching, app shell, and push notifications.
*/

const CACHE_NAME = 'zentrix-v2';
const STATIC_CACHE = 'zentrix-static-v2';
const IMAGE_CACHE = 'zentrix-images-v2';

// App shell files to cache for offline use
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== IMAGE_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event — serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (except for our API)
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api/')) {
    return;
  }

  // API requests: network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful API responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return a fallback JSON for API failures
            return new Response(
              JSON.stringify({ error: 'Offline', cached: true }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Image requests: cache first, network fallback
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) {
            // Refresh cache in background
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
            }).catch(() => {});
            return cached;
          }
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => {
            // Return a 1x1 transparent pixel for missing images
            return new Response(
              new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x3b]),
              { headers: { 'Content-Type': 'image/gif' } }
            );
          });
        });
      })
    );
    return;
  }

  // Static assets: cache first, network fallback
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cached);

        return cached || fetchPromise;
      });
    })
  );
});

// Push event — receive and display push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'Zentrix';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-192x192.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.payload || {},
    vibrate: data.vibrate || [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event — handle user clicking on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const action = event.action;

  let url = '/';
  if (notificationData.url) {
    url = notificationData.url;
  } else if (notificationData.type === 'match') {
    url = '/sports';
  } else if (notificationData.type === 'content') {
    url = `/details/movie/${notificationData.id}`;
  } else if (notificationData.type === 'episode') {
    url = `/watch/tv/${notificationData.id}?season=${notificationData.season || 1}&episode=${notificationData.episode || 1}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window client is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url,
            action,
            data: notificationData,
          });
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        self.clients.openWindow(url);
      }
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
