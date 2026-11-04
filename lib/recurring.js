// Регулярные платежи. Чистая логика (без DOM и localStorage) + runRecurring для хранилища.
import { validate } from '../ledger.js';

const pad = (n) => String(n).padStart(2, '0');
const MAX_BACK = 12;
export const clampDay = (d) => Math.min(28, Math.max(1, Math.round(+d) || 1));
const monthIdx = (ym) => +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1);
const fromIdx = (i) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
const dateOfCreated = (c) => {
  if (c == null) return null;
  if (typeof c === 'number') { const d = new Date(c); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return String(c).slice(0, 10);
};

/**
 * Какие списания пора провести: [{ recId, date }]. Догоняет пропущенные месяцы
 * (не глубже 12 месяцев назад и не раньше даты создания), будущие даты не трогает.
 * createdAt — число (мс) или строка 'YYYY-MM-DD'.
 */
export function dueOccurrences(recurring, todayStr) {
  const out = [], nowIdx = monthIdx(todayStr);
  for (const r of recurring || []) {
    if (!r || r.active === false) continue;
    const day = clampDay(r.day), created = dateOfCreated(r.createdAt);
    let from = nowIdx - MAX_BACK;
    if (r.lastRun) from = Math.max(from, monthIdx(r.lastRun) + 1);
    if (created) from = Math.max(from, monthIdx(created));
    for (let i = from; i <= nowIdx; i++) {
      const date = `${fromIdx(i)}-${pad(day)}`;
      if (date > todayStr) break;
      if (created && date < created) continue;
      out.push({ recId: r.id, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

/**
 * Проводит due-операции прямо в state: добавляет в state.txs (с recurringId) и двигает lastRun.
 * Второй раз за тот же месяц не создаёт. Невалидные шаблоны пропускаются (lastRun всё равно двигается).
 * Возвращает массив добавленных операций.
 */
export function applyRecurring(state, todayStr) {
  const added = [];
  const due = dueOccurrences(state.recurring, todayStr);
  const byId = new Map((state.recurring || []).map((r) => [r.id, r]));
  const have = new Set(state.txs.filter((t) => t.recurringId).map((t) => t.recurringId + '|' + t.date.slice(0, 7)));
  for (const { recId, date } of due) {
    const r = byId.get(recId), key = recId + '|' + date.slice(0, 7);
    r.lastRun = date.slice(0, 7);
    if (have.has(key)) continue;
    const tx = { ...r.tpl, date, recurringId: recId };
    if (validate(tx).length) continue;
    have.add(key);
    added.push({ id: newId(), createdAt: Date.now() + added.length, ...tx });
  }
  state.txs.push(...added);
  return added;
}

/** Для хранилища store: проводит платежи, сохраняет, возвращает число добавленных. */
export function runRecurring(store, todayStr) {
  if (!dueOccurrences(store.get().recurring, todayStr).length) return 0;
  let n = 0;
  store.mutate((s) => { n = applyRecurring(s, todayStr).length; });
  return n;
}

/** Ближайшая дата следующего списания (для подписи в списке). */
export function nextDate(rec, todayStr) {
  const day = clampDay(rec.day), i = monthIdx(todayStr);
  const cur = `${fromIdx(i)}-${pad(day)}`;
  return cur > todayStr ? cur : `${fromIdx(i + 1)}-${pad(day)}`;
}
