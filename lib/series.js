// Ряд остатка общего баланса по дням для графика на главной. Чистая логика, без DOM.
import { balances } from '../ledger.js';

const DAY = 86400000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const toMs = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const toYmd = (ms) => new Date(ms).toISOString().slice(0, 10);
/** Как операция меняет общий баланс (карта + наличные). Скрытые от партнёра операции — тоже деньги. */
const jointDelta = (t) => balances([t]).joint;

/**
 * Остаток общего баланса на конец каждого из последних `days` дней до даты `end` включительно.
 * Дни без операций повторяют предыдущий остаток; операции позже `end` не учитываются.
 * @returns {{date: string, value: number}[]} копейки; [] при неверных параметрах
 */
export function balanceSeries(txs, { days = 30, end } = {}) {
  const n = Math.floor(days);
  if (!YMD.test(end || '') || !(n >= 1)) return [];
  const startMs = toMs(end) - (n - 1) * DAY, start = toYmd(startMs);
  const perDay = new Map();
  let value = 0;
  for (const t of txs) {
    if (!YMD.test(t.date || '') || t.date > end) continue;
    const d = jointDelta(t);
    if (t.date < start) value += d;
    else perDay.set(t.date, (perDay.get(t.date) || 0) + d);
  }
  return Array.from({ length: n }, (_, i) => {
    const date = toYmd(startMs + i * DAY);
    value += perDay.get(date) || 0;
    return { date, value };
  });
}

/** Изменение за период: сумма и процент от начального остатка (null, если считать не от чего). */
export function rangeDelta(series) {
  if (series.length < 2) return { amount: 0, pct: 0 };
  const first = series[0].value, amount = series[series.length - 1].value - first;
  return { amount, pct: first ? (amount / Math.abs(first)) * 100 : amount ? null : 0 };
}

/** Точки графика в координатах SVG; ровный ряд рисуется по центру высоты. */
export function chartPoints(series, { w, h, padX = 14, top = 28, bottom = 18 }) {
  const vals = series.map((p) => p.value), min = Math.min(...vals), span = Math.max(...vals) - min;
  const step = series.length > 1 ? (w - 2 * padX) / (series.length - 1) : 0, inner = h - top - bottom;
  return series.map((p, i) => ({
    ...p,
    x: series.length > 1 ? padX + i * step : w / 2,
    y: span ? top + inner - ((p.value - min) / span) * inner : top + inner / 2,
  }));
}

/** Плавная кривая через точки (Catmull-Rom → кубические Безье). */
export function smoothPath(pts) {
  if (!pts.length) return '';
  const r = (n) => Math.round(n * 10) / 10;
  let d = `M${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y), clamp = (y) => Math.max(lo, Math.min(hi, y));   // без выбросов за пределы отрезка
    d += ` C${r(p1.x + (p2.x - p0.x) / 6)} ${r(clamp(p1.y + (p2.y - p0.y) / 6))},${r(p2.x - (p3.x - p1.x) / 6)} ${r(clamp(p2.y - (p3.y - p1.y) / 6))},${r(p2.x)} ${r(p2.y)}`;
  }
  return d;
}
