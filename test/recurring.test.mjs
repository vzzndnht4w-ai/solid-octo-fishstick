import test from 'node:test';
import assert from 'node:assert/strict';
import { dueOccurrences, applyRecurring, runRecurring, nextDate } from '../lib/recurring.js';
import { spentByCategory, budgetState, budgetRows, goalSaved, goalState } from '../lib/plan.js';

const rent = (o = {}) => ({
  id: 'r1', day: 5, lastRun: null, active: true, createdAt: '2026-08-01',
  tpl: { type: 'expense', amount: 5000000, category: 'Жильё', scope: 'shared', person: 'max', paidFrom: 'joint', method: 'card', shareMax: 50, note: 'Аренда', hidden: false },
  ...o,
});

test('dueOccurrences: догоняет пропущенные месяцы с даты создания', () => {
  const d = dueOccurrences([rent()], '2026-11-04');
  assert.deepEqual(d.map((x) => x.date), ['2026-08-05', '2026-09-05', '2026-10-05']);
});

test('dueOccurrences: день наступил сегодня — включается', () => {
  const d = dueOccurrences([rent()], '2026-11-05');
  assert.equal(d.at(-1).date, '2026-11-05');
});

test('dueOccurrences: не раньше создания (день месяца создания уже прошёл)', () => {
  const d = dueOccurrences([rent({ createdAt: '2026-10-20' })], '2026-11-04');
  assert.deepEqual(d, []);
});

test('dueOccurrences: не глубже 12 месяцев', () => {
  const d = dueOccurrences([rent({ createdAt: '2020-01-01' })], '2026-11-04');
  assert.equal(d.length, 12);
  assert.equal(d[0].date, '2025-11-05');
});

test('dueOccurrences: учитывает lastRun, паузу и число создания в мс', () => {
  assert.deepEqual(dueOccurrences([rent({ lastRun: '2026-09' })], '2026-11-04').map((x) => x.date), ['2026-10-05']);
  assert.deepEqual(dueOccurrences([rent({ active: false })], '2026-11-04'), []);
  assert.equal(dueOccurrences([rent({ createdAt: Date.UTC(2026, 9, 1, 12) })], '2026-11-04').length, 1);
});

test('applyRecurring: создаёт операции один раз и двигает lastRun', () => {
  const st = { txs: [], recurring: [rent()] };
  const a = applyRecurring(st, '2026-11-04');
  assert.equal(a.length, 3);
  assert.equal(st.txs.length, 3);
  assert.ok(st.txs.every((t) => t.recurringId === 'r1' && t.id && t.createdAt));
  assert.equal(st.recurring[0].lastRun, '2026-10');
  assert.equal(applyRecurring(st, '2026-11-04').length, 0);
  assert.equal(applyRecurring(st, '2026-11-06').length, 1);
  assert.equal(st.txs.length, 4);
});

test('applyRecurring: не дублирует уже существующую операцию месяца и пропускает невалидные', () => {
  const st = { txs: [{ id: 'x', recurringId: 'r1', date: '2026-09-07', type: 'expense', amount: 1 }], recurring: [rent(), rent({ id: 'bad', tpl: { type: 'expense', amount: 0 } })] };
  const a = applyRecurring(st, '2026-11-04');
  assert.deepEqual(a.map((t) => t.date), ['2026-08-05', '2026-10-05']);
  assert.equal(st.recurring[1].lastRun, '2026-10');
});

test('runRecurring: работает через store.mutate и возвращает число', () => {
  const state = { txs: [], recurring: [rent()] };
  let saves = 0;
  const store = { get: () => state, mutate: (fn) => { fn(state); saves++; } };
  assert.equal(runRecurring(store, '2026-11-04'), 3);
  assert.equal(runRecurring(store, '2026-11-04'), 0);
  assert.equal(saves, 1);
});

test('nextDate', () => {
  assert.equal(nextDate(rent(), '2026-11-04'), '2026-11-05');
  assert.equal(nextDate(rent(), '2026-11-05'), '2026-12-05');
});

test('spentByCategory: общие целиком, личные только свои, чужие скрытые не считаются', () => {
  const e = (o) => ({ type: 'expense', date: '2026-11-02', category: 'Продукты', amount: 100, scope: 'shared', person: 'max', hidden: false, ...o });
  const txs = [e({}), e({ scope: 'personal', person: 'max' }), e({ scope: 'personal', person: 'dinara' }), e({ person: 'dinara', hidden: true }), e({ date: '2026-10-02' }), e({ type: 'income' })];
  assert.equal(spentByCategory(txs, '2026-11', 'max').Продукты, 200);
  assert.equal(spentByCategory(txs, '2026-11', 'dinara').Продукты, 300);
});

test('budgetState и budgetRows: уровни и сортировка', () => {
  assert.equal(budgetState(1000, 700).level, 'ok');
  assert.equal(budgetState(1000, 800).level, 'warn');
  assert.equal(budgetState(1000, 1000).level, 'warn');
  assert.equal(budgetState(1000, 1200).level, 'over');
  assert.equal(budgetState(1000, 1200).left, -200);
  const rows = budgetRows({ A: 1000, B: 1000, C: 0 }, { A: 500, B: 900 });
  assert.deepEqual(rows.map((r) => r.cat), ['B', 'A']);
});

test('goalSaved и goalState', () => {
  const txs = [{ type: 'transfer', goalId: 'g', amount: 300 }, { type: 'transfer', goalId: 'g', amount: 200 }, { type: 'transfer', amount: 999 }, { type: 'transfer', goalId: 'z', amount: 5 }];
  assert.equal(goalSaved(txs, 'g'), 500);
  const g = { target: 1200000, deadline: '2027-03-04' };
  const st = goalState(g, 200000, '2026-11-04');
  assert.equal(st.left, 1000000);
  assert.equal(st.monthsLeft, 4);
  assert.equal(st.need, 250000);
  assert.equal(goalState(g, 1200000, '2026-11-04').done, true);
  assert.equal(goalState({ target: 100, deadline: '2026-01-01' }, 0, '2026-11-04').overdue, true);
});
