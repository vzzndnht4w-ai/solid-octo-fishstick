const CACHE = 'we-money-v4';
const ASSETS = ['./', 'index.html'];  // остальное кэшируется при первом запросе
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// Сначала сеть (чтобы обновления приходили сразу), при отсутствии сети — кэш.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});

// ---------- Push-уведомления ----------
// Сервер присылает JSON {title, body, url, tag}. Тексты общие, без сумм и названий.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const opts = { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, data: { url: d.url || './' } };
  e.waitUntil(self.registration.showNotification(d.title || 'Мы', opts));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'go', url: target }); return c.focus(); }   // приложение открыто: переходим без перезагрузки
    return self.clients.openWindow(target);
  }));
});
