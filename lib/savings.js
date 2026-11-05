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

/** Остаток скрыт от этого зрителя: hidden у чужого личного счёта. У «Общих» скрытие недоступно. */
export const isMasked = (it, viewer) => !!it.hidden && it.owner !== 'joint' && it.owner !== viewer;

/** Сумма всего, что зритель вправе видеть. */
export const totalFor = (items, viewer) => items.reduce((s, it) => s + (isMasked(it, viewer) ? 0 : num(it.amount)), 0);

/** Разбивка по владельцам: { max, dinara, joint } (скрытые от зрителя не учитываются). */
export function byOwner(items, viewer) {
  const out = { max: 0, dinara: 0, joint: 0 };
  for (const it of items) if (it.owner in out && !isMasked(it, viewer)) out[it.owner] += num(it.amount);
  return out;
}

/** Разбивка по типам: [{ kind, total }] по убыванию, только ненулевые. */
export function byKind(items, viewer) {
  const m = {};
  for (const it of items) if (!isMasked(it, viewer)) { const k = it.kind in KINDS ? it.kind : 'other'; m[k] = (m[k] || 0) + num(it.amount); }
  return Object.entries(m).filter(([, v]) => v > 0).map(([kind, total]) => ({ kind, total })).sort((a, b) => b.total - a.total);
}

/** Группировка для экрана. mode: 'people' | 'kinds'. Возвращает [{ key, total, items }]; пустые группы не отдаются. */
export function groupItems(items, mode, viewer) {
  const keys = mode === 'kinds' ? KIND_ORDER : OWNERS;
  const keyOf = (it) => (mode === 'kinds' ? (it.kind in KINDS ? it.kind : 'other') : (OWNERS.includes(it.owner) ? it.owner : 'joint'));
  return keys.map((key) => {
    const list = items.filter((it) => keyOf(it) === key)
      .sort((a, b) => (isMasked(a, viewer) - isMasked(b, viewer)) || num(b.amount) - num(a.amount));
    return { key, items: list, total: totalFor(list, viewer) };
  }).filter((g) => g.items.length);
}

/** Видимые зрителю элементы. */
export const visibleItems = (items, viewer) => items.filter((it) => !isMasked(it, viewer));

/** Ожидаемая простая доходность за год, копейки. Только если задана ставка > 0. */
export const yearlyYield = (it) => (Number(it.rate) > 0 ? Math.round(num(it.amount) * Number(it.rate) / 100) : 0);

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

/** Копия счёта с новым остатком и точкой в истории; длина истории ограничена. */
export function withPoint(it, amount, at = Date.now()) {
  const hist = [...(Array.isArray(it.history) ? it.history : []), { at, amount }];
  return { ...it, amount, history: hist.slice(-MAX_HISTORY) };
}

/** Применить операцию: 'in' (пополнить), 'out' (снять), 'set' (задать остаток). Возвращает { item } или { error }. */
export function applyOp(it, op, value, at = Date.now()) {
  if (!Number.isInteger(value) || value < 0) return { error: 'Введите сумму' };
  if (op !== 'set' && value === 0) return { error: 'Сумма должна быть больше нуля' };
  const cur = num(it.amount);
  let next;
  if (op === 'in') next = cur + value;
  else if (op === 'out') { if (value > cur) return { error: 'Нельзя снять больше остатка' }; next = cur - value; }
  else if (op === 'set') next = value;
  else return { error: 'Неизвестное действие' };
  return { item: withPoint(it, next, at) };
}

/**
 * Ряд для мини-графика: сумма видимых счетов после каждого изменения (по дням, последняя точка дня).
 * Счёт без истории считается постоянным; до первой точки счёта он даёт 0.
 * Меньше 3 точек — [] (график не рисуем).
 */
export function chartSeries(items, viewer, maxPoints = 12) {
  const vis = visibleItems(items, viewer);
  const times = new Set();
  for (const it of vis) for (const h of it.history || []) if (Number.isFinite(h?.at)) times.add(h.at);
  const sorted = [...times].sort((a, b) => a - b);
  const day = (ms) => { const d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const pts = sorted.map((at) => {
    let total = 0;
    for (const it of vis) {
      const hist = (it.history || []).filter((x) => Number.isFinite(x?.at));
      const upto = hist.filter((x) => x.at <= at);
      if (upto.length) total += num(upto.reduce((m, x) => (x.at >= m.at ? x : m)).amount);
      else if (!hist.length) total += num(it.amount);
    }
    return { at, amount: total };
  });
  const byDay = [];
  for (const p of pts) { if (byDay.length && day(byDay[byDay.length - 1].at) === day(p.at)) byDay[byDay.length - 1] = p; else byDay.push(p); }
  const out = byDay.slice(-Math.max(3, maxPoints));
  return out.length >= 3 ? out : [];
}
