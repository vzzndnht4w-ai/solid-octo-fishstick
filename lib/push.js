// Push-уведомления: рантайм (разрешение, подписка, сервер). Чистая логика — в push-core.js.
import { store } from '../store.js';
import { PEOPLE } from '../ledger.js';
import { buildReminders, normPrefs, urlBase64ToUint8Array, toB64u, isValidVapidPublic, diagnose, eventsForPending } from './push-core.js';
import * as sync from './sync.js';

const KEY = 'we-money-push';

// ---------- локальное хранилище устройства ----------
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch {} };

export const getVapidPublic = () => read().vapidPublic || '';
export const setVapidPublic = (k) => { if (isValidVapidPublic(k)) { write({ vapidPublic: k.trim() }); return true; } return false; };
export function getDeviceId() {
  let id = read().deviceId;
  if (!id) {
    const r = crypto.getRandomValues(new Uint8Array(16));
    id = [...r].map((b) => b.toString(16).padStart(2, '0')).join('');
    write({ deviceId: id });
  }
  return id;
}

// ---------- поддержка ----------
export const isStandalone = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const permission = () => ('Notification' in window ? Notification.permission : 'denied');

export const prefs = () => normPrefs(store.get().settings.notify);
export const setPrefs = (fn) => store.mutate((s) => { const n = normPrefs(s.settings.notify); fn(n); s.settings.notify = n; });

// ---------- сервер ----------
const authHeaders = (key) => ({ apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json' });
const noServer = () => { const e = new Error('Сначала подключите синхронизацию'); e.code = 'no-sync'; return e; };

async function call(where, path, body) {
  const cfg = sync.getCfg(); if (!cfg) throw noServer();
  let r;
  try { r = await fetch(`${cfg.url}${path}`, { method: 'POST', headers: authHeaders(cfg.key), body: JSON.stringify(body) }); }
  catch { throw Object.assign(new Error(diagnose(where, { network: true })), { code: 'network' }); }
  let json = null; try { json = await r.json(); } catch {}
  const msg = diagnose(where, { status: r.status, body: json });
  if (msg) throw Object.assign(new Error(msg), { code: 'http', status: r.status });
  return json;
}
const rpc = (name, body) => call('rpc', `/rest/v1/rpc/${name}`, body);

async function currentSub() {
  const reg = await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}
export async function isSubscribed() {
  if (!isSupported()) return false;
  try { return !!(await currentSub()).sub; } catch { return false; }
}

async function register(sub) {
  const p = prefs();
  const j = sub.toJSON();
  await rpc('push_register', { p_room: await sync.getRoom(), p_device: getDeviceId(), p_person: store.get().viewer, p_sub: { ...j, prefs: { partnerAdds: p.partnerAdds, partnerReacts: p.partnerReacts } } });
  lastPrefsKey = `${p.partnerAdds}${p.partnerReacts}`;
}

/** Включение на этом телефоне. Вызывать только из обработчика нажатия (iOS требует жест пользователя). */
export async function enable() {
  if (!isSupported()) throw Object.assign(new Error('Этот браузер не поддерживает уведомления'), { code: 'unsupported' });
  if (!sync.isConnected()) throw noServer();
  const pub = getVapidPublic();
  if (!pub) throw Object.assign(new Error('Нет ключей уведомлений. Создайте их в шаге 2'), { code: 'no-keys' });
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw Object.assign(new Error('Разрешение не выдано. Включите уведомления для «Мы» в Настройки iPhone → Уведомления'), { code: 'denied' });
  const { reg, sub: old } = await currentSub();
  let sub = old;
  // Подписка со старым ключом (после пересоздания ключей) не подходит: снимаем и подписываемся заново.
  try { if (sub && sub.options?.applicationServerKey && toB64u(new Uint8Array(sub.options.applicationServerKey)) !== pub) { await sub.unsubscribe(); sub = null; } } catch {}
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pub) });
  await register(sub);
  setPrefs((n) => { n.enabled = true; });
  lastHash = '';
  scheduleReminders(300);
}

export async function disable() {
  try {
    const { sub } = await currentSub();
    if (sub) await sub.unsubscribe();
  } catch {}
  try { if (sync.isConnected()) await rpc('push_unregister', { p_room: await sync.getRoom(), p_device: getDeviceId() }); } catch {}
  setPrefs((n) => { n.enabled = false; });
  lastHash = '';
}

// ---------- напоминания ----------
let timer = null, lastHash = '', lastPrefsKey = '';

/** Пересчитывает напоминания и заменяет ими все напоминания этого телефона на сервере. Тихо: ошибки не мешают. */
export async function syncReminders({ force = false } = {}) {
  const st = store.get(), p = normPrefs(st.settings.notify);
  if (!p.enabled || !sync.isConnected() || !isSupported() || permission() !== 'granted') return;
  try {
    const { sub } = await currentSub(); if (!sub) return;
    if (lastPrefsKey !== `${p.partnerAdds}${p.partnerReacts}`) await register(sub);
    const items = buildReminders(st, new Date(), p);
    const h = JSON.stringify(items);
    if (!force && h === lastHash) return;
    await rpc('push_set_reminders', { p_room: await sync.getRoom(), p_device: getDeviceId(), p_items: items });
    lastHash = h;
  } catch { /* повторим при следующем изменении */ }
}
/** Отложенный пересчёт после изменений данных. */
export function scheduleReminders(ms = 6000) {
  clearTimeout(timer);
  timer = setTimeout(() => syncReminders(), ms);
}

// ---------- события партнёру ----------
function post(body) {
  const cfg = sync.getCfg(); if (!cfg) return null;
  return fetch(`${cfg.url}/functions/v1/we-push`, { method: 'POST', headers: authHeaders(cfg.key), body: JSON.stringify(body) });
}

/** Сообщить партнёру о событии. Без ожидания; ошибки глушатся. Тексты — только общие. */
export async function notifyPartner({ title, body, url, kind }) {
  try {
    if (!getVapidPublic() || !sync.isConnected()) return;
    const room = await sync.getRoom();
    post({ action: 'notify', room, from_device: getDeviceId(), title, body, url, kind })?.catch(() => {});
  } catch {}
}

/** Вызывается из синхронизации после успешной отправки НОВЫХ записей этого телефона. */
export function announceNew(list) {
  try {
    const s = store.get(), me = s.viewer; if (!me) return;
    for (const ev of eventsForPending(list, { person: me, name: PEOPLE[me], female: !!s.profiles[me]?.female })) notifyPartner(ev);
  } catch {}
}

/** Тестовое уведомление себе. Возвращает {sent, devices}; при ошибке бросает понятное сообщение. */
export async function sendTest() {
  const room = await sync.getRoom();
  const res = await call('fn', '/functions/v1/we-push', { action: 'notify', room, from_device: getDeviceId(), include_self: true, title: 'Мы', body: 'Уведомления работают', url: './?go=notifications', kind: 'test' });
  if (!res?.sent) {
    if (!res?.devices) throw Object.assign(new Error('В Supabase нет подписки этого телефона. Нажмите «Выключить» и снова «Включить уведомления на этом телефоне», затем повторите тест'), { code: 'no-sub' });
    const e = res.errors?.[0];
    const why = !e ? '' : e.status === 401 || e.status === 403 ? ' Apple отклонил ключи: VAPID_PRIVATE_KEY в Supabase не соответствует публичному ключу приложения. Проверьте оба секрета или создайте ключи заново'
      : e.status === 400 ? ' Сервис Apple отклонил запрос (400): проверьте секрет VAPID_SUBJECT, он должен быть вида mailto:ваш@адрес'
      : e.status ? ` Код ответа сервиса уведомлений: ${e.status}.` : ` ${e.msg || ''}`;
    throw Object.assign(new Error('Подписка есть, но сервер не смог отправить уведомление.' + why), { code: 'send-failed' });
  }
  return res;
}

// ---------- запуск ----------
let started = false;
export function init() {
  if (started) return; started = true;
  store.subscribe(() => { if (store.get().settings.notify?.enabled) scheduleReminders(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReminders(2000); });
  scheduleReminders(5000);
}

/** Переход по нажатию на уведомление, когда приложение уже открыто (сообщение от service worker). */
export function onNotificationGo(go) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'go') return;
    try { const r = new URL(e.data.url).searchParams.get('go'); if (r) go(r); } catch {}
  });
}
