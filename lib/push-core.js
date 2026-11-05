// Ядро push-уведомлений: чистая логика без DOM и сети (тестируется в Node).
// ВАЖНО: тексты пушей уходят на сервер открытым текстом, поэтому они общие: без сумм, категорий и заметок.
import { debt } from '../ledger.js';
import { nextDate, clampDay } from './recurring.js';
import { debtAgeDays } from './tools.js';

const subtle = globalThis.crypto.subtle;

// ---------- base64url и ключи VAPID ----------
export const toB64u = (u8) => {
  let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/** base64url → Uint8Array (для applicationServerKey). */
export function urlBase64ToUint8Array(b64) {
  const s = String(b64 || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Пара VAPID (ECDSA P-256): публичный — 65 байт uncompressed (0x04…), приватный — 32 байта 'd'. Формат библиотеки web-push. */
export async function generateVapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const jwk = await subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: toB64u(pub), privateKey: jwk.d };
}
export function isValidVapidPublic(k) {
  try { const u = urlBase64ToUint8Array(k); return u.length === 65 && u[0] === 4; } catch { return false; }
}

// ---------- настройки ----------
export const NOTIFY_DEFAULTS = {
  enabled: false, partnerAdds: true, partnerReacts: true, payments: true,
  date: { on: true, dow: 0, hour: 19 }, debt: true, evening: { on: false, hour: 21 }, quiet: { from: 22, to: 8 },
};
const hourOf = (v, d) => (Number.isInteger(+v) && +v >= 0 && +v <= 23 && v !== null && v !== '' ? +v : d);
/** Дополняет настройки значениями по умолчанию (старые сохранения без поля notify не ломаются). */
export function normPrefs(n = {}) {
  const D = NOTIFY_DEFAULTS, x = n || {};
  const bool = (k) => (typeof x[k] === 'boolean' ? x[k] : D[k]);
  const dow = x.date?.dow;
  return {
    enabled: bool('enabled'), partnerAdds: bool('partnerAdds'), partnerReacts: bool('partnerReacts'), payments: bool('payments'), debt: bool('debt'),
    date: { on: typeof x.date?.on === 'boolean' ? x.date.on : D.date.on, dow: Number.isInteger(dow) && dow >= 0 && dow <= 6 ? dow : D.date.dow, hour: hourOf(x.date?.hour, D.date.hour) },
    evening: { on: typeof x.evening?.on === 'boolean' ? x.evening.on : D.evening.on, hour: hourOf(x.evening?.hour, D.evening.hour) },
    quiet: { from: hourOf(x.quiet?.from, D.quiet.from), to: hourOf(x.quiet?.to, D.quiet.to) },
  };
}

// ---------- планировщик ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (day, h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0);
const DEBT_MIN = 100000;   // 1000 ₽ в копейках
const DEBT_DAYS = 14;
const DEBT_DOW = 3;        // среда
export const HORIZON_DAYS = 14;
export const MAX_REMINDERS = 100;

const inQuiet = (h, { from, to }) => (from === to ? false : from > to ? h >= from || h < to : h >= from && h < to);
/** Если время попало в тихие часы — переносит на конец тихих часов (по местному времени). */
export function shiftQuiet(d, quiet) {
  if (!inQuiet(d.getHours(), quiet)) return d;
  let r = at(d, quiet.to);
  if (r <= d) r = at(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), quiet.to);
  return r;
}

/**
 * Напоминания на ближайшие 14 дней. now — Date или мс. Время — по часовому поясу устройства.
 * Возвращает [{ fire_at(ISO), title, body, url, tag }] без сумм, категорий и имён.
 */
export function buildReminders(state, now = new Date(), prefs = state?.settings?.notify) {
  const p = normPrefs(prefs), nowD = new Date(now), end = nowD.getTime() + HORIZON_DAYS * 86400000;
  const day0 = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()), today = ymd(day0);
  const out = new Map();
  const add = (when, title, body, tag, url) => {
    const t = shiftQuiet(when, p.quiet);
    if (t <= nowD || t.getTime() > end || out.has(tag)) return;
    out.set(tag, { fire_at: t.toISOString(), title, body, url, tag });
  };
  const days = Array.from({ length: HORIZON_DAYS + 1 }, (_, i) => new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + i));

  if (p.payments) {
    for (const r of state?.recurring || []) {
      if (!r || r.active === false) continue;
      const dates = new Set([nextDate(r, today)]);
      if (clampDay(r.day) === day0.getDate()) dates.add(today);
      for (const date of dates) {
        const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
        add(at(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1), 19), 'Завтра регулярный платёж', 'Загляните в календарь платежей', `pay-${date}-before`, './?go=calendar');
        add(at(d, 9), 'Сегодня регулярный платёж', 'Загляните в календарь платежей', `pay-${date}-day`, './?go=calendar');
      }
    }
  }
  if (p.date.on) {
    for (const d of days) if (d.getDay() === p.date.dow) add(at(d, p.date.hour), 'Финансовое свидание', 'Пора обсудить деньги вдвоём', `date-${ymd(d)}`, './?go=date');
  }
  if (p.debt) {
    const txs = state?.txs || [], age = debtAgeDays(txs, today);
    if (age != null && Math.abs(debt(txs)) > DEBT_MIN) {
      days.forEach((d, i) => { if (d.getDay() === DEBT_DOW && age + i > DEBT_DAYS) add(at(d, 12), 'Долг висит давно', 'Давно не закрывали долг друг перед другом', `debt-${ymd(d)}`, './?go=home'); });
    }
  }
  if (p.evening.on) {
    const entered = (state?.txs || []).some((t) => t.date === today);
    days.forEach((d, i) => { if (i === 0 && entered) return; add(at(d, p.evening.hour), 'Запишите сегодняшние траты', 'Пара минут, и всё на месте', `eve-${ymd(d)}`, './?go=add'); });
  }
  return [...out.values()].sort((a, b) => a.fire_at.localeCompare(b.fire_at)).slice(0, MAX_REMINDERS);
}

// ---------- события партнёру ----------
/**
 * Что сообщить партнёру по списку записей, отправленных на сервер ({id, data, deleted}).
 * Только НОВЫЕ (ещё не отправлявшиеся) id. Скрытые/сюрпризные операции не уведомляют.
 * Возвращает [{kind, title, body, url}] — не более одного на тип. Без сумм и категорий.
 */
export function eventsForPending(list, { person, name, female = false, seen = new Set(), prefs } = {}) {
  const p = normPrefs(prefs), n = name || 'Партнёр', e = female ? 'а' : '';
  let tx = 0, react = 0;
  for (const r of list || []) {
    if (!r || r.deleted || !r.data || seen.has(r.id)) continue;
    if (r.id.startsWith('tx:') && r.data.person === person && !r.data.hidden && !r.data.recurringId) tx++;
    else if (r.id.startsWith('col:comments:') && r.data.person === person) react++;
  }
  const out = [];
  if (tx && p.partnerAdds) out.push({ kind: 'tx', title: 'Мы', body: tx > 1 ? `${n} добавил${e} операции` : `${n} добавил${e} операцию`, url: './?go=feed' });
  if (react && p.partnerReacts) out.push({ kind: 'react', title: 'Мы', body: `${n} оставил${e} реакцию`, url: './?go=feed' });
  return out;
}

// ---------- диагностика ----------
/**
 * Понятное объяснение ошибки сервера. where: 'rpc' (таблицы/функции Postgres) или 'fn' (Edge Function).
 * res: { status, body } или { network: true }. Возвращает строку или null, если всё хорошо.
 */
export function diagnose(where, res = {}) {
  if (res.network) return 'Нет связи с сервером. Проверьте интернет и адрес проекта';
  const { status, body } = res;
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return 'Сервер не принял ключ (401). Проверьте ключ anon public в «Синхронизации»; у функции we-push должна быть выключена проверка Verify JWT';
  if (where === 'rpc') {
    if (status === 404) return 'Нет таблиц уведомлений. Выполните SQL из шага 2';
    return `Ошибка сервера при регистрации (${status})`;
  }
  if (status === 404 && body?.error === 'no_room') return 'Пара не найдена на сервере. Нажмите «Синхронизировать сейчас» в «Синхронизации»';
  if (status === 404) return 'Функция we-push не найдена. Задеплойте её (шаг 2, пункт «Код функции»)';
  if (status === 429) return 'Слишком часто. Подождите минуту';
  if (status >= 500) return `Ошибка функции (${status}). Проверьте секреты VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT и таблицы в шаге 2`;
  return `Функция недоступна (${status})`;
}
