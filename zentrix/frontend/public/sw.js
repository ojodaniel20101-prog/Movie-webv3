/*
  Zentrix Service Worker — Push Notifications v1.0
  Handles background push notifications and notification click events.
*/

const CACHE_NAME = 'zentrix-v1';

// Install event — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
      ]);
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
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
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
