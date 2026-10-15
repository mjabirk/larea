// ==============================================================================
// Apex Global ERP - W3C Web Push & Desktop Notifications Service Worker
// ==============================================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. Push Event: Handle background push message from server VAPID dispatcher
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'Apex Global ERP',
        body: event.data.text()
      };
    }
  }

  const title = data.title || 'Apex ERP • Notification';
  const options = {
    body: data.body || 'You have received a new internal communication.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'apex-chat-push',
    data: {
      url: data.url || '/?app=chat',
      timestamp: data.timestamp || Date.now()
    },
    vibrate: [100, 50, 100],
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 2. Notification Click: Bring existing ERP tab into focus or navigate to channel
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open in the ERP origin, focus it and navigate
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window open, open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
