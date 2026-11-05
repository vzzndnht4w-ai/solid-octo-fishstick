// Накопления: чистая логика (без DOM). Деньги — целые копейки.
// Накопления не участвуют в балансах кошельков и долгах — это отдельный учёт.

export const KINDS = {
  cash: { label: 'Наличные', icon: 'cash', color: '#3fae78' },
  card: { label: 'Карта', icon: 'card', color: '#4f86f0' },
  account: { label: 'Счёт', icon: 'bank', color: '#9a6cff' },
  deposit: { label: 'Вклад', icon: 'sv-percent', color: '#e2a63c' },
  invest: { label: 'Инвестиции', icon: 'sv-trend', color: '#ec5877' },
  other: { label: 'Прочее', icon: 'coins', color: '#858aa0' },
};
export const KIND_ORDER = Object.keys(KINDS);
export const OWNERS = ['max', 'dinara', 'joint'];
export const kindOf = (k) => KINDS[k] || KINDS.other;

const MAX_HISTORY = 200;
const num = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);

const isLink = (t, it) => t && t.type === 'saving' && t.savingId === it.id;

/**
 * Остаток счёта: последний ручной снимок (amount, baseAt) + операции 'saving' этого счёта, созданные позже снимка.
 * Удаление или правка связанной операции сама пересчитывает остаток.
 */
export function balanceOf(it, txs = []) {
  const base = Number.isFinite(it.baseAt) ? it.baseAt : 0;
  let b = num(it.amount);
  for (const t of txs) if (isLink(t, it) && (Number(t.createdAt) || 0) > base) b += num(t.amount);
  return b;
}

/** Связанные операции счёта, новые сверху. */
export const linkedTxs = (it, txs = [], n = Infinity) =>
  txs.filter((t) => isLink(t, it)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).slice(0, n);

/** Сколько всего отложено с кошельков на этот счёт (за вычетом возвратов). */
export const savedFromWallets = (it, txs = []) => txs.reduce((s, t) => s + (isLink(t, it) ? num(t.amount) : 0), 0);

/** Проверка перевода с/на кошелёк. dir: 1 — отложить (free = свободно на кошельке), -1 — вернуть (free = остаток счёта). */
export function checkMove(value, dir, free) {
  if (!Number.isInteger(value) || value <= 0) return 'Введите сумму больше нуля';
  if (value > free) return dir > 0 ? 'На кошельке нет столько денег' : 'Нельзя вернуть больше остатка счёта';
  return '';
}

/** Остаток скрыт от этого зрителя: hidden у чужого личного счёта. У «Общих» скрытие недоступно. */
export const isMasked = (it, viewer) => !!it.hidden && it.owner !== 'joint' && it.owner !== viewer;

/** Сумма всего, что зритель вправе видеть. */
export const totalFor = (items, viewer, txs = []) => items.reduce((s, it) => s + (isMasked(it, viewer) ? 0 : balanceOf(it, txs)), 0);

/** Разбивка по владельцам: { max, dinara, joint } (скрытые от зрителя не учитываются). */
export function byOwner(items, viewer, txs = []) {
  const out = { max: 0, dinara: 0, joint: 0 };
  for (const it of items) if (it.owner in out && !isMasked(it, viewer)) out[it.owner] += balanceOf(it, txs);
  return out;
}

/** Разбивка по типам: [{ kind, total }] по убыванию, только ненулевые. */
export function byKind(items, viewer, txs = []) {
  const m = {};
  for (const it of items) if (!isMasked(it, viewer)) { const k = it.kind in KINDS ? it.kind : 'other'; m[k] = (m[k] || 0) + balanceOf(it, txs); }
  return Object.entries(m).filter(([, v]) => v > 0).map(([kind, total]) => ({ kind, total })).sort((a, b) => b.total - a.total);
}

/** Группировка для экрана. mode: 'people' | 'kinds'. Возвращает [{ key, total, items }]; пустые группы не отдаются. */
export function groupItems(items, mode, viewer, txs = []) {
  const keys = mode === 'kinds' ? KIND_ORDER : OWNERS;
  const keyOf = (it) => (mode === 'kinds' ? (it.kind in KINDS ? it.kind : 'other') : (OWNERS.includes(it.owner) ? it.owner : 'joint'));
  return keys.map((key) => {
    const list = items.filter((it) => keyOf(it) === key)
      .sort((a, b) => (isMasked(a, viewer) - isMasked(b, viewer)) || balanceOf(b, txs) - balanceOf(a, txs));
    return { key, items: list, total: totalFor(list, viewer, txs) };
  }).filter((g) => g.items.length);
}

/** Видимые зрителю элементы. */
export const visibleItems = (items, viewer) => items.filter((it) => !isMasked(it, viewer));

/** Ожидаемая простая доходность за год, копейки. Только если задана ставка > 0. */
export const yearlyYield = (it, txs = []) => (Number(it.rate) > 0 ? Math.round(Math.max(0, balanceOf(it, txs)) * Number(it.rate) / 100) : 0);

/** Дней до окончания вклада (отрицательное — срок вышел); null, если даты нет. */
export function daysLeft(until, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until || '') || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return null;
  const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(until) - t(today)) / 86400000);
}

/** Разбор ставки: '7,5' → 7.5; пусто → null; <0, >100 или не число → NaN. */
export function parseRate(str) {
  const t = String(str ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

/** Копия счёта с новым ручным снимком остатка (amount + baseAt) и точкой в истории; длина истории ограничена. */
export function withPoint(it, amount, at = Date.now()) {
  const hist = [...(Array.isArray(it.history) ? it.history : []), { at, amount }];
  return { ...it, amount, baseAt: at, history: hist.slice(-MAX_HISTORY) };
}

/** Применить операцию: 'in' (пополнить), 'out' (снять), 'set' (задать остаток). Возвращает { item } или { error }. */
export function applyOp(it, op, value, at = Date.now(), txs = []) {
  if (!Number.isInteger(value) || value < 0) return { error: 'Введите сумму' };
  if (op !== 'set' && value === 0) return { error: 'Сумма должна быть больше нуля' };
  const cur = balanceOf(it, txs);
  let next;
  if (op === 'in') next = cur + value;
  else if (op === 'out') { if (value > cur) return { error: 'Нельзя снять больше остатка' }; next = cur - value; }
  else if (op === 'set') next = value;
  else return { error: 'Неизвестное действие' };
  return { item: withPoint(it, next, at) };
}

/**
 * Ряд для мини-графика: сумма видимых счетов после каждого изменения (по дням, последняя точка дня).
 * Изменения: точки history (ручные снимки) и связанные операции (по createdAt).
 * Счёт без истории считается снимком amount на момент baseAt. До первой точки счёт даёт 0.
 * Меньше 3 точек — [] (график не рисуем).
 */
export function chartSeries(items, viewer, txs = [], maxPoints = 12) {
  const vis = visibleItems(items, viewer);
  const ok = (x) => Number.isFinite(x);
  const per = vis.map((it) => {
    const hist = (it.history || []).filter((h) => ok(h?.at)).sort((a, b) => a.at - b.at);
    const links = txs.filter((t) => isLink(t, it) && ok(Number(t.createdAt))).map((t) => ({ at: Number(t.createdAt), d: num(t.amount) })).sort((a, b) => a.at - b.at);
    return { it, hist, links };
  });
  const times = new Set();
  for (const { hist, links } of per) { hist.forEach((h) => times.add(h.at)); links.forEach((l) => times.add(l.at)); }
  const valueAt = ({ it, hist, links }, at) => {
    const upto = hist.filter((h) => h.at <= at);
    let snapAt, snap;
    if (upto.length) { const h = upto[upto.length - 1]; snapAt = h.at; snap = num(h.amount); }
    else if (!hist.length) { snapAt = Number.isFinite(it.baseAt) ? it.baseAt : 0; snap = num(it.amount); }
    else return 0;
    return snap + links.reduce((s, l) => s + (l.at > snapAt && l.at <= at ? l.d : 0), 0);
  };
  const day = (ms) => { const d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const pts = [...times].sort((a, b) => a - b).map((at) => ({ at, amount: per.reduce((s, p) => s + valueAt(p, at), 0) }));
  const byDay = [];
  for (const p of pts) { if (byDay.length && day(byDay[byDay.length - 1].at) === day(p.at)) byDay[byDay.length - 1] = p; else byDay.push(p); }
  const out = byDay.slice(-Math.max(3, maxPoints));
  return out.length >= 3 ? out : [];
}
