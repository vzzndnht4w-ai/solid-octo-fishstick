// Чистая логика бюджетов и целей (без DOM и localStorage). Деньги — целые копейки.

/** Траты месяца по категориям с точки зрения viewer: общие целиком + личные viewer; чужие скрытые не считаем. */
export function spentByCategory(txs, ym, viewer) {
  const out = {};
  for (const t of txs) {
    if (t.type !== 'expense' || !t.date || !t.date.startsWith(ym)) continue;
    if (t.hidden && t.person !== viewer) continue;
    if (t.scope === 'personal' && t.person !== viewer) continue;
    out[t.category] = (out[t.category] || 0) + t.amount;
  }
  return out;
}

/** Состояние одного лимита: доля, остаток и уровень (ok < 80% <= warn <= 100% < over). */
export function budgetState(limit, spent) {
  const pct = limit > 0 ? spent / limit : 0;
  const level = pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
  return { limit, spent, pct, left: limit - spent, level };
}

/** Категории с лимитом, самые напряжённые (ближе к лимиту / больше перерасход) — первыми. */
export function budgetRows(budgets, spent) {
  return Object.entries(budgets || {})
    .filter(([, lim]) => lim > 0)
    .map(([cat, lim]) => ({ cat, ...budgetState(lim, spent[cat] || 0) }))
    .sort((a, b) => b.pct - a.pct);
}

/** Сколько накоплено в цели: сумма переводов с goalId. */
export const goalSaved = (txs, goalId) => txs.reduce((s, t) => s + (t.type === 'transfer' && t.goalId === goalId ? t.amount : 0), 0);

const dayNum = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);

/** Состояние цели на дату today. need — сколько откладывать в месяц до срока (если задан и цель не достигнута). */
export function goalState(goal, saved, today) {
  const target = goal.target || 0;
  const pct = target > 0 ? Math.min(1, saved / target) : 0;
  const left = Math.max(0, target - saved);
  const done = target > 0 && saved >= target;
  let need = null, overdue = false, monthsLeft = null;
  if (goal.deadline && !done) {
    const days = dayNum(goal.deadline) - dayNum(today);
    if (days < 0) overdue = true;
    else { monthsLeft = Math.max(1, Math.ceil(days / 30.44)); need = Math.ceil(left / monthsLeft); }
  }
  return { saved, target, pct, left, done, need, overdue, monthsLeft };
}
