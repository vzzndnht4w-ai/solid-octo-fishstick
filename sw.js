const CACHE = 'we-money-v6';
// Оболочка и сканер кладутся в кэш сразу; остальные модули — при первом запуске.
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'lib/vendor/jsQR.min.js'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('install', (e) => {
  // по одному: недоступный файл не должен срывать установку
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const stamp = (r) => (r ? r.headers.get('etag') || r.headers.get('last-modified') || '' : '');
/** Скачивает свежую версию в кэш; если файл приложения изменился, сообщает открытым окнам. */
async function refresh(req, cached, own) {
  const r = await fetch(req, own ? { cache: 'no-cache' } : undefined);
  if (!r || !(r.ok || r.type === 'opaque')) return r;
  const c = await caches.open(CACHE);
  await c.put(req, r.clone());
  if (own && cached && stamp(cached) && stamp(r) && stamp(cached) !== stamp(r)) {
    const list = await self.clients.matchAll({ type: 'window' });
    list.forEach((w) => w.postMessage({ type: 'updated' }));
  }
  return r;
}
// Сначала сохранённая копия (запуск мгновенный и при плохой связи), обновление качается в фоне
// и применяется при следующем открытии. Нет копии — идём в сеть.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), own = url.origin === self.location.origin;
  if (!own && !FONT_HOSTS.includes(url.hostname)) return;   // чужие запросы (Supabase) не трогаем
  e.respondWith((async () => {
    // страница с параметрами (?go=…, ?add=…) — та же оболочка
    const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    const fresh = refresh(req, cached, own).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || Response.error();
  })());
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
