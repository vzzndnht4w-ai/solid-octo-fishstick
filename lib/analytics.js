// Чистая аналитика поверх списка операций. Без DOM. Деньги — копейки.
import { splitAmount, balances, other } from '../ledger.js';

const pad = (n) => String(n).padStart(2, '0');

/** Сдвиг месяца 'YYYY-MM' на d месяцев. */
export const shiftYm = (ym, d) => {
  const t = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + d, 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
};
export const daysInMonth = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
/** Операция, детали которой спрятаны от viewer. */
export const isSecret = (t, viewer) => !!t.hidden && t.person !== viewer;
const inYm = (t, ym) => t.date.startsWith(ym);

/** Доходы/расходы по месяцам: n месяцев, заканчивая endYm (по возрастанию). */
export function monthlySeries(txs, endYm, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push({ ym: shiftYm(endYm, -i), income: 0, expense: 0, net: 0, count: 0 });
  const idx = Object.fromEntries(out.map((m, i) => [m.ym, i]));
  for (const t of txs) {
    const i = idx[t.date.slice(0, 7)];
    if (i === undefined) continue;
    if (t.type === 'income') { out[i].income += t.amount; out[i].count++; }
    else if (t.type === 'expense') { out[i].expense += t.amount; out[i].count++; }
  }
  for (const m of out) m.net = m.income - m.expense;
  return out;
}

/** Остаток общего котла (или, если котёл не использовался, суммарный баланс) на конец каждого из n месяцев. */
export function potSeries(txs, endYm, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ym = shiftYm(endYm, -i), upTo = txs.filter((t) => t.date.slice(0, 7) <= ym), b = balances(upTo);
    out.push({ ym, joint: b.joint, total: b.joint + b.max + b.dinara });
  }
  const usesJoint = out.some((p) => p.joint !== 0);
  return { kind: usesJoint ? 'joint' : 'total', points: out.map((p) => ({ ym: p.ym, value: usesJoint ? p.joint : p.total })) };
}

/**
 * Расходы по категориям за месяц.
 * scope: 'all' | 'shared' | 'personal'; who: 'both' | 'me' | 'other' (доля viewer / второго человека).
 * Чужие скрытые траты не попадают никуда. Возвращает [[категория, сумма], …] по убыванию.
 */
export function categoryTotals(txs, { ym, viewer, scope = 'all', who = 'both' } = {}) {
  const by = {};
  for (const t of txs) {
    if (t.type !== 'expense' || (ym && !inYm(t, ym)) || isSecret(t, viewer)) continue;
    if (scope !== 'all' && t.scope !== scope) continue;
    let amt = t.amount;
    if (who !== 'both') {
      const target = who === 'me' ? viewer : other(viewer);
      if (t.scope === 'personal') amt = t.person === target ? t.amount : 0;
      else { const sp = splitAmount(t.amount, t.shareMax); amt = sp[target]; }
    }
    if (amt > 0) by[t.category] = (by[t.category] || 0) + amt;
  }
  return Object.entries(by).sort((a, b) => b[1] - a[1]);
}

export const expenseTotal = (txs, ym) => txs.reduce((s, t) => s + (t.type === 'expense' && inYm(t, ym) ? t.amount : 0), 0);

/** Сколько дней месяца уже прошло к today ('YYYY-MM-DD'); для прошлых месяцев — весь месяц, для будущих — 0. */
export function elapsedDays(ym, today) {
  const cur = today.slice(0, 7);
  if (ym < cur) return daysInMonth(ym);
  if (ym > cur) return 0;
  return +today.slice(8, 10);
}

/** Средний расход в день (копейки) или null, если дней ещё нет. */
export function dailyAverage(txs, ym, today) {
  const d = elapsedDays(ym, today);
  return d ? Math.round(expenseTotal(txs, ym) / d) : null;
}

/** Прогноз расходов на конец месяца: только для текущего месяца, иначе null. */
export function forecast(txs, ym, today) {
  if (ym !== today.slice(0, 7)) return null;
  const d = elapsedDays(ym, today);
  if (!d) return null;
  return Math.round((expenseTotal(txs, ym) / d) * daysInMonth(ym));
}

/**
 * Короткие наблюдения для главной. Возвращает до 2 штук [{ icon, text, tone }]; при малом объёме данных — [].
 * tone: 'good' | 'warn' | 'info'. money — функция форматирования копеек.
 */
export function insights(txs, ym, viewer, money = (k) => `${Math.round(k / 100)} ₽`) {
  const cur = txs.filter((t) => inYm(t, ym));
  if (cur.filter((t) => t.type !== 'transfer').length < 3) return [];
  const prevYm = shiftYm(ym, -1);
  const curCat = Object.fromEntries(categoryTotals(txs, { ym, viewer }));
  const prevCat = Object.fromEntries(categoryTotals(txs, { ym: prevYm, viewer }));
  const out = [];

  let best = null;
  for (const [c, v] of Object.entries(curCat)) {
    const p = prevCat[c];
    if (!p || p < 100_00 || v < 100_00) continue;
    const pct = Math.round(((v - p) / p) * 100);
    if (Math.abs(pct) < 15) continue;
    if (!best || Math.abs(v - p) > Math.abs(best.diff)) best = { c, pct, diff: v - p };
  }
  if (best) out.push(best.pct > 0
    ? { icon: 'chart', tone: 'warn', text: `${best.c}: на ${best.pct}% больше, чем в прошлом месяце` }
    : { icon: 'chart', tone: 'good', text: `${best.c}: на ${-best.pct}% меньше, чем в прошлом месяце` });

  const topUp = cur.reduce((s, t) => s + (t.type === 'transfer' && t.to === 'joint' && t.from !== 'joint' ? t.amount : 0), 0);
  if (topUp > 0) out.push({ icon: 'bank', tone: 'good', text: `Общий котёл пополнен на ${money(topUp)}` });

  const big = cur.filter((t) => t.type === 'expense' && !isSecret(t, viewer)).sort((a, b) => b.amount - a.amount)[0];
  if (big) out.push({ icon: 'star', tone: 'info', text: `Самая большая трата месяца — ${big.category}, ${money(big.amount)}` });

  return out.slice(0, 2);
}

/** Компактная подпись суммы для оси: 12 500 ₽ → «12,5 тыс», 3 400 000 → «3,4 млн». Вход — копейки. */
export function compactMoney(kop) {
  const r = Math.abs(kop) / 100, sign = kop < 0 ? '−' : '';
  const f = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  if (r >= 1e6) return `${sign}${f(r / 1e6)} млн`;
  if (r >= 1e3) return `${sign}${f(r / 1e3)} тыс`;
  return `${sign}${Math.round(r)}`;
}

/** «Красивый» максимум оси и шаг: возвращает { max, step } так, что max = step * k (k = 2..4). Вход — копейки. */
export function niceScale(maxVal, minVal = 0) {
  const lo = Math.min(0, minVal), hi = Math.max(maxVal, 1);
  const span = hi - lo, raw = span / 3, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}
