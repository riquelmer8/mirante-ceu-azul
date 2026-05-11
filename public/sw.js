// Service worker do Mirante.
// 1) Cacheia o "shell" da app pra funcionar offline.
// 2) Recebe push events e mostra notificações.

const CACHE = 'mirante-v4';
const SHELL = [
  '/',
  '/css/styles.css',
  '/js/calendar-shared.js',
  '/js/calendar.js',
  '/js/pwa.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/logo-mirante.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(req).then((resp) => {
      return resp || fetch(req).then((netResp) => {
        if (netResp && netResp.ok && url.origin === self.location.origin) {
          const clone = netResp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return netResp;
      }).catch(() => resp);
    })
  );
});

// =====================
// Push notifications
// =====================
self.addEventListener('push', (event) => {
  let dados = { titulo: 'Mirante Céu Azul', corpo: 'Você tem uma notificação', url: '/admin' };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag: 'mirante-' + (dados.url || 'default'),
      data: { url: dados.url || '/admin' },
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((lista) => {
      for (const cli of lista) {
        if (cli.url.includes(url) && 'focus' in cli) return cli.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
