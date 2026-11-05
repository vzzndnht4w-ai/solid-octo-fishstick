// «Быстрые инструменты»: шаблоны, ссылки-команды, сюрпризы, календарь платежей, запас баланса, возраст долга.
// Чистая логика без DOM. Деньги — целые копейки, даты — 'YYYY-MM-DD'.
import { balances, stats, splitAmount, method as methodOf, validate } from '../ledger.js';
import { nextDate, clampDay } from './recurring.js';

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localToday = () => ymdOf(new Date());
const toUTC = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
/** Целых дней от a до b ('YYYY-MM-DD'); отрицательно, если b раньше. */
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
/** Дата + n дней. */
export const addDays = (s, n) => ymdOf(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n));
const monthIdx = (s) => +s.slice(0, 4) * 12 + (+s.slice(5, 7) - 1);
const shiftYm = (ym, d) => { const i = monthIdx(ym) + d; return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`; };
const SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** '2026-02-14' → '14 фев'. */
export const shortDate = (s) => `${+s.slice(8, 10)} ${SHORT[+s.slice(5, 7) - 1]}`;
/** Склонение: plural(2, 'день', 'дня', 'дней'). */
export const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 15 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };

// ---------- Сюрприз ----------
/**
 * Спрятаны ли детали операции от viewer. Свои операции видны всегда; чужая скрытая операция
 * открывается партнёру автоматически, когда наступила дата раскрытия revealOn (<= today).
 */
export function isSecret(t, viewer, today = localToday()) {
  if (!t || !t.hidden || t.person === viewer) return false;
  return !(t.revealOn && t.revealOn <= today);
}
/** Для автора: ещё не раскрытый сюрприз (hidden + revealOn в будущем). */
export const isPendingSurprise = (t, viewer, today = localToday()) => !!(t && t.hidden && t.person === viewer && t.revealOn && t.revealOn > today);

// ---------- Шаблоны ----------
const TPL_KEYS = ['type', 'amount', 'category', 'scope', 'person', 'paidFrom', 'method', 'shareMax', 'wallet', 'note', 'hidden'];
/** Шаблон из полей готовой операции/черновика (только нужные поля, без дат и revealOn). */
export function templateFromTx(tx) {
  const tpl = {};
  for (const k of TPL_KEYS) if (tx[k] !== undefined && tx[k] !== null && tx[k] !== '') tpl[k] = tx[k];
  return tpl;
}
/**
 * Операция из шаблона на дату today для того, кто за телефоном: люди в шаблоне заменяются на viewer
 * (шаблон общий, а «лично» значит «лично у меня»); общий баланс сохраняется.
 */
export function txFromTemplate(tpl, today, viewer) {
  const t = { type: 'expense', ...tpl, date: today, note: tpl.note || '', hidden: !!tpl.hidden };
  const me = (w) => (w === 'joint' ? 'joint' : viewer);
  if (t.type === 'income') { t.person = viewer; t.wallet = me(t.wallet || viewer); t.method = t.method || 'card'; }
  else if (t.type === 'expense') {
    t.person = viewer; t.method = t.method || 'card';
    if (t.scope === 'personal') t.paidFrom = viewer;
    else { t.scope = 'shared'; t.paidFrom = me(t.paidFrom || viewer); t.shareMax = t.shareMax ?? 50; }
  }
  delete t.revealOn;
  return t;
}
/** Ошибки валидации шаблона-операции (пустой массив — всё хорошо). */
export const templateErrors = (tpl, viewer) => validate(txFromTemplate(tpl, '2000-01-01', viewer));

const tplKey = (c, a, m) => `${c}|${a}|${m}`;
/**
 * Повторяющиеся траты за последние 90 дней: категория + сумма + способ, ≥3 раза.
 * Уже покрытые шаблонами пропускаются. Возвращает [{ category, amount, method, count, tpl }] по убыванию count.
 * Чужие скрытые операции и переводы не учитываются.
 */
export function suggestTemplates(txs, today = localToday(), templates = [], viewer = null, minCount = 3) {
  const from = addDays(today, -90), by = new Map();
  for (const t of txs) {
    if (t.type !== 'expense' || t.recurringId || t.date < from || t.date > today) continue;
    if (viewer && isSecret(t, viewer, today)) continue;
    if (t.scope === 'personal' && viewer && t.person !== viewer) continue;
    const k = tplKey(t.category, t.amount, methodOf(t));
    const e = by.get(k) || { category: t.category, amount: t.amount, method: methodOf(t), count: 0, last: t };
    e.count++; if (t.date >= e.last.date) e.last = t;
    by.set(k, e);
  }
  const have = new Set(templates.map((x) => tplKey(x.tpl?.category, x.tpl?.amount, x.tpl?.method || 'card')));
  return [...by.values()].filter((e) => e.count >= minCount && !have.has(tplKey(e.category, e.amount, e.method)))
    .sort((x, y) => y.count - x.count || y.amount - x.amount)
    .map((e) => ({ category: e.category, amount: e.amount, method: e.method, count: e.count, tpl: templateFromTx(e.last) }));
}

// ---------- Быстрые ссылки ----------
const CATEGORY_MAX = 40, NOTE_MAX = 120;
const norm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').trim();
/** Сумма из ссылки в рублях ('450', '450,5', '1 200.50') → строка для поля формы или ''. */
function amountParam(v) {
  const n = Number(String(v).replace(/[\s ]/g, '').replace(',', '.'));
  if (!isFinite(n) || n <= 0 || n > 1e9) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}
/**
 * Разбор строки запроса ссылки (`location.search`):
 *  ?add=450&cat=Продукты&scope=shared|personal&method=card|cash&note=Кофе   → заготовка формы (все параметры необязательные)
 *  ?tpl=Название шаблона                                                    → { tpl: 'Название шаблона' }
 * Возвращает null, если нет ни add, ни tpl. Заготовка подходит для startWith(): { type, amount, category?, scope?, method?, note? }.
 */
export function parseQuickLink(search) {
  let q;
  try { q = new URLSearchParams(String(search || '')); } catch { return null; }
  const tpl = (q.get('tpl') || '').trim();
  if (tpl) return { tpl: tpl.slice(0, 60) };
  if (!q.has('add')) return null;
  const d = { type: 'expense', amount: amountParam(q.get('add')) };
  const cat = (q.get('cat') || '').trim().slice(0, CATEGORY_MAX);
  if (cat) d.category = cat;
  const scope = norm(q.get('scope'));
  if (scope === 'shared' || scope === 'personal') d.scope = scope;
  const m = norm(q.get('method'));
  if (m === 'card' || m === 'cash') d.method = m;
  const note = (q.get('note') || '').trim().slice(0, NOTE_MAX);
  if (note) d.note = note;
  return d;
}
/** Собирает ссылку (query) из заготовки — для примеров и копирования. */
export function buildQuickLink(base, d = {}) {
  const q = new URLSearchParams();
  if (d.tpl) q.set('tpl', d.tpl);
  else {
    q.set('add', d.amount ?? '');
    for (const k of ['cat', 'scope', 'method', 'note']) if (d[k]) q.set(k, d[k]);
  }
  return `${base}?${q.toString().replace(/\+/g, '%20')}`;
}
/** Шаблон по названию (без учёта регистра и «ё»). */
export const findTemplate = (templates, title) => (templates || []).find((x) => norm(x.title) === norm(title)) || null;

// ---------- Календарь платежей ----------
/**
 * Ближайшие списания регулярных платежей на `days` дней вперёд (включая today).
 * Уже проведённые за месяц/пропущенные (lastRun >= месяц даты) и приостановленные не входят.
 * → [{ recId, date, in, tpl }] по возрастанию даты.
 */
export function upcomingCharges(recurring, today, days = 30) {
  const end = addDays(today, days), out = [];
  for (const r of recurring || []) {
    if (!r || r.active === false || !r.tpl) continue;
    let d = nextDate(r, today);
    if (r.day != null && clampDay(r.day) === +today.slice(8, 10) && !(r.lastRun && r.lastRun >= today.slice(0, 7))) d = today; // сегодняшний, ещё не проведённый
    for (let i = 0; i < 3 && d <= end; i++) {
      if (!(r.lastRun && d.slice(0, 7) <= r.lastRun) && d >= today) out.push({ recId: r.id, date: d, in: daysBetween(today, d), tpl: r.tpl });
      d = `${shiftYm(d.slice(0, 7), 1)}-${pad(clampDay(r.day))}`;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
/** Итоги по списку upcomingCharges: сколько уйдёт (расходы) и придёт (доходы). */
export function chargesTotals(list) {
  let out = 0, inc = 0;
  for (const c of list) { if (c.tpl.type === 'income') inc += c.tpl.amount; else if (c.tpl.type !== 'transfer') out += c.tpl.amount; }
  return { out, inc };
}
/**
 * Что сделать с регулярным платежом, чтобы пропустить списание в месяце date: новое значение lastRun
 * (не раньше текущего). Применяет вызывающий: rec.lastRun = skipLastRun(rec, date).
 */
export const skipLastRun = (rec, date) => { const ym = date.slice(0, 7); return rec.lastRun && rec.lastRun > ym ? rec.lastRun : ym; };

// ---------- Запас баланса ----------
/**
 * Хватит ли общего баланса: остаток баланса / средние общие расходы в месяц.
 * Берутся до 3 полных месяцев перед ym; если их нет — сам ym. Нужны траты хотя бы в 1 месяце и ≥3 общих трат.
 * → { months (число с десятой), joint, monthly } или null, если данных мало или баланс пуст.
 */
export function runway(txs, ym) {
  const joint = balances(txs).joint;
  const shared = (t) => t.type === 'expense' && t.scope === 'shared';
  const prev = [shiftYm(ym, -3), shiftYm(ym, -2), shiftYm(ym, -1)];
  let months = prev, list = txs.filter((t) => shared(t) && prev.includes(t.date.slice(0, 7)));
  if (list.length < 3) { months = [ym]; list = txs.filter((t) => shared(t) && t.date.startsWith(ym)); }
  if (list.length < 3 || joint <= 0) return null;
  const used = new Set(list.map((t) => t.date.slice(0, 7))).size;
  const monthly = Math.round(list.reduce((s, t) => s + t.amount, 0) / used);
  if (monthly <= 0) return null;
  return { months: Math.round((joint / monthly) * 10) / 10, joint, monthly };
}

// ---------- Долг ----------
/**
 * Сколько дней висит нынешний долг: от даты, когда он возник (из нуля или сменил сторону)
 * до today. Нет долга — null.
 */
export function debtAgeDays(txs, today = localToday()) {
  const evs = [];
  for (const t of txs) {
    let delta = 0;
    if (t.type === 'expense' && t.scope === 'shared') {
      const s = splitAmount(t.amount, t.shareMax);
      if (t.paidFrom === 'max') delta = s.dinara; else if (t.paidFrom === 'dinara') delta = -s.max;
    } else if (t.type === 'transfer') {
      if (t.from === 'max' && t.to === 'dinara') delta = t.amount; else if (t.from === 'dinara' && t.to === 'max') delta = -t.amount;
    }
    if (delta) evs.push({ date: t.date, c: t.createdAt || 0, delta });
  }
  evs.sort((a, b) => a.date.localeCompare(b.date) || a.c - b.c);
  let d = 0, since = null;
  for (const e of evs) {
    const nd = d + e.delta;
    if (nd === 0) since = null;
    else if (d === 0 || Math.sign(nd) !== Math.sign(d)) since = e.date;
    d = nd;
  }
  return d === 0 || !since ? null : Math.max(0, daysBetween(since, today));
}

// ---------- Деление по доходам ----------
/** Доля первого человека в % по доходам за последние `months` месяцев (включая текущий); null, если доходов нет. */
export function incomeShare(txs, today = localToday(), months = 3) {
  const from = `${shiftYm(today.slice(0, 7), -(months - 1))}-01`;
  const recent = txs.filter((t) => t.date >= from && t.date <= `${today.slice(0, 7)}-31`);
  const s = stats(recent), total = s.max.earned + s.dinara.earned;
  return total === 0 ? null : Math.round((s.max.earned / total) * 100);
}
