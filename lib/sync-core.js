// Ядро синхронизации: чистая логика без DOM и сети (тестируется в Node).
// Модель: состояние раскладывается на записи (операция, цель, платёж, лимит бюджета, профиль…).
// Каждая запись шифруется на телефоне; сервер видит только непрозрачный id, шифротекст и время.
// Конфликты решаются «последняя правка побеждает» отдельно по каждой записи.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder(), dec = new TextDecoder();

/** JSON со стабильным порядком ключей — для сравнения записей. */
export const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

/** Раскладывает состояние на записи: Map(id → данные). */
export function collect(s) {
  const m = new Map();
  for (const t of s.txs || []) m.set(`tx:${t.id}`, t);
  for (const g of s.goals || []) m.set(`goal:${g.id}`, g);
  for (const r of s.recurring || []) m.set(`rec:${r.id}`, r);
  for (const [c, v] of Object.entries(s.budgets || {})) m.set(`bud:${c}`, { c, v });
  for (const p of ['max', 'dinara']) if (s.profiles?.[p]) m.set(`prof:${p}`, s.profiles[p]);
  for (const kind of ['expense', 'income']) for (const n of s.categories?.[kind] || []) m.set(`cat:${kind}:${n}`, { kind, n });
  const st = s.settings || {};
  m.set('set:shared', { currency: st.currency, defaultShare: st.defaultShare, defaultMethod: st.defaultMethod });
  return m;
}

/**
 * Находит локальные изменения с прошлой синхронизации и ставит им время.
 * known: { id: {h, u, del} } — что мы уже знаем (изменяется на месте).
 * baseline — записи по умолчанию (Map), которые не нужно отправлять, пока их не изменили.
 * Возвращает Map(id → {id, data, u, deleted}) — что нужно отправить.
 */
export function stampLocal(state, known, now, baseline = new Map()) {
  const cur = collect(state), pending = new Map();
  for (const [id, data] of cur) {
    const h = canon(data), k = known[id];
    // Нетронутые значения по умолчанию (имена, валюта) не считаем правкой: иначе они затрут настроенное партнёром.
    if (!k && baseline.has(id) && canon(baseline.get(id)) === h) { known[id] = { h, u: 0, del: false }; continue; }
    if (!k || k.del || k.h !== h) { known[id] = { h, u: now, del: false }; pending.set(id, { id, data, u: now, deleted: false }); }
  }
  for (const id of Object.keys(known)) {
    if (!cur.has(id) && !known[id].del) { known[id] = { h: null, u: now, del: true }; pending.set(id, { id, data: null, u: now, deleted: true }); }
  }
  return pending;
}

const upsert = (arr, item) => { const i = arr.findIndex((x) => x.id === item.id); if (i >= 0) arr[i] = item; else arr.push(item); };
const drop = (arr, id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); };

/** Применяет запись с сервера к состоянию, если она новее известной. Возвращает true, если применена. */
export function applyRemote(state, known, rec) {
  const k = known[rec.id];
  if (k && k.u >= rec.u) return false;
  const { id, data, deleted } = rec;
  const [kind, ...rest] = id.split(':'), tail = rest.join(':');
  if (kind === 'tx') { state.txs ||= []; deleted ? drop(state.txs, tail) : upsert(state.txs, data); }
  else if (kind === 'goal') { state.goals ||= []; deleted ? drop(state.goals, tail) : upsert(state.goals, data); }
  else if (kind === 'rec') { state.recurring ||= []; deleted ? drop(state.recurring, tail) : upsert(state.recurring, data); }
  else if (kind === 'bud') { state.budgets ||= {}; deleted ? delete state.budgets[tail] : (state.budgets[data.c] = data.v); }
  else if (kind === 'prof') { if (!deleted) state.profiles[tail] = { ...data }; }
  else if (kind === 'cat') {
    const [ck, ...nm] = rest, name = nm.join(':');
    state.categories ||= { expense: [], income: [] }; state.categories[ck] ||= [];
    const list = state.categories[ck], i = list.indexOf(name);
    if (deleted) { if (i >= 0) list.splice(i, 1); } else if (i < 0) list.push(name);
  } else if (id === 'set:shared') { if (!deleted) Object.assign(state.settings, data); }
  known[id] = { h: deleted ? null : canon(data), u: rec.u, del: !!deleted };
  return true;
}

// ---------- шифрование ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const normCode = (code) => String(code || '').replace(/[\s-]/g, '').toUpperCase();

/** Из секретного кода пары получаем: идентификатор пары (room) и ключ шифрования. */
export async function deriveKeys(code) {
  const norm = normCode(code);
  const room = hex(await subtle.digest('SHA-256', enc.encode('room:' + norm))).slice(0, 32);
  const base = await subtle.importKey('raw', enc.encode(norm), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('we-money/v1'), iterations: 100000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { room, key, norm };
}

const opaqueId = async (norm, id) => hex(await subtle.digest('SHA-256', enc.encode(norm + '|' + id))).slice(0, 32);

/** Запись → строка для сервера {room, id, payload, u}. */
export async function sealRecord(keys, rec) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, keys.key, enc.encode(JSON.stringify({ id: rec.id, data: rec.data, deleted: rec.deleted }))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return { room: keys.room, id: await opaqueId(keys.norm, rec.id), payload: b64(out), u: rec.u };
}

/** Строка с сервера → запись. Бросает ошибку, если не расшифровалась. */
export async function openRecord(keys, row) {
  const buf = unb64(row.payload);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, keys.key, buf.subarray(12));
  const o = JSON.parse(dec.decode(pt));
  return { id: o.id, data: o.data, deleted: !!o.deleted, u: row.u };
}

// ---------- код пары и приглашение ----------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 символа = 5 бит, 24 символа ≈ 120 бит
export function newCode() {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(24));
  const s = [...r].map((b) => ALPHABET[b % 32]).join('');
  return s.match(/.{4}/g).join('-');
}

const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Ссылка-приглашение: адрес приложения + #join=<данные подключения>. */
export const makeInvite = (base, { url, key, code }) => `${base}#join=${b64u(JSON.stringify({ u: url, k: key, c: code }))}`;

/** Разбор приглашения (ссылка целиком или только данные после #join=). Возвращает {url,key,code} или null. */
export function parseInvite(text) {
  try {
    const t = String(text || '').trim();
    const raw = t.includes('#join=') ? t.split('#join=')[1] : t.replace(/^#?join=/, '');
    const o = JSON.parse(unb64u(raw.trim()));
    if (!o.u || !o.k || !o.c) return null;
    return { url: o.u, key: o.k, code: o.c };
  } catch { return null; }
}

/** Нормализует адрес проекта Supabase: https://xxxx.supabase.co без хвостов. */
export function normUrl(u) {
  let s = String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (s && !/^https?:\/\//.test(s)) s = 'https://' + s;
  return s;
}
