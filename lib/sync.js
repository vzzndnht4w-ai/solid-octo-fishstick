// Синхронизация между телефонами через Supabase (REST, без SDK). Логика слияния — в sync-core.js.
import { store, defaults } from '../store.js';
import { collect, canon, stampLocal, applyRemote, deriveKeys, sealRecord, openRecord, makeInvite, parseInvite, normUrl } from './sync-core.js';

const KEY = 'we-money-sync';
const PAGE = 500, BATCH = 200;
let cfg = null, known = {}, cursor = 0, keys = null, timer = null, interval = null, busy = false, again = false;
const status = { state: 'off', last: null, err: '' }; // off | idle | syncing | error | offline
const subs = new Set();
const emit = () => subs.forEach((f) => f());

// Приглашение из ссылки (#join=...) запоминаем и убираем из адресной строки.
let pendingInvite = null;
try {
  if (location.hash.startsWith('#join=')) { pendingInvite = parseInvite(location.hash); history.replaceState(null, '', location.pathname + location.search); }
} catch {}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && d.cfg) { cfg = d.cfg; known = d.known || {}; cursor = d.cursor || 0; status.last = d.last || null; status.state = 'idle'; }
  } catch {}
}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ cfg, known, cursor, last: status.last })); } catch {} };

// Новые ключи Supabase (sb_publishable_…) — не JWT: их передают только в apikey. Старый anon-ключ (eyJ…) — и в Authorization.
const authHeaders = (key) => ({ apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + key }), 'Content-Type': 'application/json' });
const headers = () => authHeaders(cfg.key);
const rpc = (name, body) => fetch(`${cfg.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });

async function pullAll() {
  let since = cursor, rows = [];
  for (;;) {
    const r = await rpc('sync_pull', { p_room: keys.room, p_since: since, p_limit: PAGE });
    if (!r.ok) throw new Error(httpError(r.status));
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) break;
    since = page[page.length - 1].srv;
  }
  return rows;
}

async function pushAll(list) {
  for (let i = 0; i < list.length; i += BATCH) {
    const rows = await Promise.all(list.slice(i, i + BATCH).map((r) => sealRecord(keys, r)));
    const r = await rpc('sync_push', { p_rows: rows });
    if (!r.ok) throw new Error(httpError(r.status));
  }
}

function httpError(code) {
  if (code === 401 || code === 403) return 'Сервер не принял ключ. Проверьте ключ anon public';
  if (code === 404) return 'Функции синхронизации не найдены. Выполните SQL из инструкции';
  return `Ошибка сервера (${code})`;
}

export async function syncNow() {
  if (!cfg) return;
  if (busy) { again = true; return; }
  busy = true; status.state = 'syncing'; status.err = ''; emit();
  try {
    keys ||= await deriveKeys(cfg.code);
    const pending = stampLocal(store.get(), known, Date.now(), collect(defaults()));
    const rows = await pullAll();
    const recs = [];
    for (const row of rows) { try { recs.push(await openRecord(keys, row)); } catch { /* запись не от нашей пары или повреждена */ } }
    if (recs.length) {
      store.mutate((st) => { for (const rec of recs) if (applyRemote(st, known, rec)) pending.delete(rec.id); });
    }
    if (rows.length) cursor = Math.max(cursor, ...rows.map((r) => r.srv));
    await pushAll([...pending.values()]);
    status.state = 'idle'; status.last = Date.now();
  } catch (e) {
    status.state = navigator.onLine === false ? 'offline' : 'error';
    status.err = navigator.onLine === false ? 'Нет сети. Синхронизируем, когда появится' : (e.message === 'Failed to fetch' ? 'Нет связи с сервером' : e.message);
  } finally {
    persist(); busy = false; emit();
    if (again) { again = false; schedule(800); }
  }
}

const schedule = (ms = 1500) => { if (!cfg) return; clearTimeout(timer); timer = setTimeout(syncNow, ms); };

/** Проверка подключения до сохранения: достучались ли до сервера и есть ли таблица. */
export async function check({ url, key, code }) {
  const k = await deriveKeys(code);
  let r;
  try { r = await fetch(`${normUrl(url)}/rest/v1/rpc/sync_pull`, { method: 'POST', headers: authHeaders(key.trim()), body: JSON.stringify({ p_room: k.room, p_since: 0, p_limit: 1 }) }); }
  catch { return 'Нет связи с сервером. Проверьте адрес проекта'; }
  return r.ok ? null : httpError(r.status);
}

/**
 * Подключение. mode: 'create' — первый телефон пары (отправит всё своё);
 * 'replace' — присоединиться и взять данные пары (свои операции удалятся с этого телефона);
 * 'merge' — присоединиться и объединить с данными пары.
 */
export async function connect({ url, key, code }, mode = 'create') {
  cfg = { url: normUrl(url), key: key.trim(), code }; keys = null; known = {}; cursor = 0; status.err = '';
  if (mode === 'replace') {
    store.mutate((st) => { st.txs = []; st.goals = []; st.recurring = []; st.budgets = {}; st.categories = { expense: [], income: [] }; });
    for (const [id, data] of collect(store.get())) if (id.startsWith('prof:') || id === 'set:shared') known[id] = { h: canon(data), u: 0, del: false };
  }
  status.state = 'idle'; persist(); emit();
  await syncNow();
}

export function disconnect() {
  cfg = null; known = {}; cursor = 0; keys = null; status.state = 'off'; status.last = null; status.err = '';
  try { localStorage.removeItem(KEY); } catch {}
  emit();
}

export const getStatus = () => ({ ...status, connected: !!cfg });
export const isConnected = () => !!cfg;
export const inviteLink = () => (cfg ? makeInvite(location.origin + location.pathname, cfg) : '');
export const getCode = () => cfg?.code || '';
export const takePendingInvite = () => { const p = pendingInvite; pendingInvite = null; return p; };
export const peekPendingInvite = () => pendingInvite;
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export function init() {
  load();
  store.subscribe(() => schedule());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  window.addEventListener('online', () => syncNow());
  clearInterval(interval); interval = setInterval(() => { if (!document.hidden) syncNow(); }, 30000);
  if (cfg) syncNow();
}
