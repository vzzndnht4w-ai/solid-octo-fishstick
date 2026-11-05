import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMasked, totalFor, byOwner, byKind, groupItems, yearlyYield, daysLeft, parseRate, applyOp, chartSeries, withPoint, balanceOf, linkedTxs, savedFromWallets, checkMove } from '../lib/savings.js';

const A = { id: 'a', name: 'Нал', kind: 'cash', owner: 'max', amount: 100000, history: [] };
const B = { id: 'b', name: 'Карта', kind: 'card', owner: 'dinara', amount: 250000, hidden: true, history: [] };
const C = { id: 'c', name: 'Вклад', kind: 'deposit', owner: 'joint', amount: 1000000, rate: 7.5, until: '2027-03-12', hidden: true, history: [] };

test('скрытие: чужое скрыто, своё и общее видно', () => {
  assert.equal(isMasked(B, 'max'), true);
  assert.equal(isMasked(B, 'dinara'), false);
  assert.equal(isMasked(C, 'max'), false);
  assert.equal(isMasked(A, 'dinara'), false);
});
test('итоги учитывают видимость', () => {
  assert.equal(totalFor([A, B, C], 'max'), 1100000);
  assert.equal(totalFor([A, B, C], 'dinara'), 1350000);
  assert.deepEqual(byOwner([A, B, C], 'max'), { max: 100000, dinara: 0, joint: 1000000 });
  assert.deepEqual(byKind([A, B, C], 'max').map((x) => x.kind), ['deposit', 'cash']);
});
test('группировка', () => {
  const g = groupItems([A, B, C], 'people', 'max');
  assert.deepEqual(g.map((x) => x.key), ['max', 'dinara', 'joint']);
  assert.equal(g[1].total, 0);
  assert.deepEqual(groupItems([A, B, C], 'kinds', 'max').map((x) => x.key), ['cash', 'card', 'deposit']);
  assert.deepEqual(groupItems([], 'kinds', 'max'), []);
});
test('доходность и срок', () => {
  assert.equal(yearlyYield(C), 75000);
  assert.equal(yearlyYield(A), 0);
  assert.equal(daysLeft('2027-03-12', '2027-03-10'), 2);
  assert.equal(daysLeft('2027-03-01', '2027-03-10'), -9);
  assert.equal(daysLeft('', '2027-03-10'), null);
});
test('ставка', () => {
  assert.equal(parseRate('7,5'), 7.5);
  assert.equal(parseRate(''), null);
  assert.ok(Number.isNaN(parseRate('abc')));
  assert.ok(Number.isNaN(parseRate('150')));
});
test('операции', () => {
  assert.equal(applyOp(A, 'in', 5000, 1).item.amount, 105000);
  assert.equal(applyOp(A, 'out', 40000, 1).item.history.at(-1).amount, 60000);
  assert.ok(applyOp(A, 'out', 100001).error);
  assert.ok(applyOp(A, 'in', 0).error);
  assert.equal(applyOp(A, 'set', 0, 1).item.amount, 0);
  assert.ok(applyOp(A, 'in', null).error);
  assert.equal(A.history.length, 0); // исходный не мутируется
});
test('история ограничена', () => {
  let it = A;
  for (let i = 0; i < 250; i++) it = withPoint(it, i, i);
  assert.equal(it.history.length, 200);
});
test('ряд графика', () => {
  const day = 86400000, t0 = new Date(2026, 0, 10, 12).getTime();
  const x = { ...A, amount: 300, history: [{ at: t0, amount: 100 }, { at: t0 + 2 * day, amount: 300 }] };
  const y = { ...B, hidden: false, amount: 50, history: [{ at: t0 + day, amount: 50 }] };
  assert.deepEqual(chartSeries([x, y], 'max', []).map((p) => p.amount), [100, 150, 350]);
  assert.deepEqual(chartSeries([x], 'max', []), []); // мало точек
  const hid = { ...y, hidden: true };
  assert.equal(chartSeries([x, hid], 'max', []).length, 0); // скрытый не даёт точек
  const z = { ...A, history: [{ at: t0, amount: 1 }, { at: t0 + 1000, amount: 2 }, { at: t0 + day, amount: 3 }, { at: t0 + 2 * day, amount: 4 }] };
  assert.deepEqual(chartSeries([z], 'max', []).map((p) => p.amount), [2, 3, 4]);
  assert.equal(chartSeries([z], 'max', [], 3).length, 3);
});

const tx = (id, savingId, amount, createdAt) => ({ id, type: 'saving', savingId, wallet: 'max', method: 'card', person: 'max', amount, createdAt, date: '2026-01-01' });
test('balanceOf: снимок + операции после baseAt', () => {
  const it = { ...A, amount: 1000, baseAt: 100 };
  const txs = [tx('1', 'a', 500, 50), tx('2', 'a', 300, 150), tx('3', 'a', -100, 200), tx('4', 'zz', 999, 300)];
  assert.equal(balanceOf(it, txs), 1200); // 50 раньше снимка, чужая операция не в счёт
  assert.equal(balanceOf(it, txs.filter((t) => t.id !== '2')), 900); // удалили операцию — откат
  assert.equal(balanceOf({ ...A, amount: 0 }, [tx('1', 'a', 700, 1)]), 700); // baseAt нет → 0
  assert.equal(balanceOf(it, []), 1000);
  assert.equal(balanceOf(it, [{ type: 'expense', savingId: 'a', amount: 5, createdAt: 500 }]), 1000);
  assert.equal(balanceOf(it, [tx('9', 'a', 5, 100)]), 1000); // createdAt == baseAt не считается
});
test('ручное изменение делает новый снимок, старые операции не считаются', () => {
  const txs = [tx('1', 'a', 500, 10)];
  const r = applyOp({ ...A, amount: 100000, baseAt: 0 }, 'set', 7000, 1000, txs).item;
  assert.equal(r.baseAt, 1000);
  assert.equal(balanceOf(r, txs), 7000);
  assert.equal(balanceOf(r, [...txs, tx('2', 'a', -2000, 2000)]), 5000);
  const out = applyOp({ ...A, amount: 100, baseAt: 0 }, 'out', 450, 5, [tx('1', 'a', 400, 1)]);
  assert.equal(out.item.amount, 50); // вычет считается от вычисленного остатка 500
  assert.ok(applyOp({ ...A, amount: 100, baseAt: 0 }, 'out', 600, 5, [tx('1', 'a', 400, 1)]).error);
});
test('итоги используют вычисленный остаток и учитывают скрытые', () => {
  const txs = [tx('1', 'a', 50000, 5), tx('2', 'b', 10000, 5), tx('3', 'c', -100000, 5)];
  assert.equal(totalFor([A, B, C], 'max', txs), 100000 + 50000 + 900000);
  assert.equal(totalFor([A, B, C], 'dinara', txs), 150000 + 260000 + 900000);
  assert.equal(byOwner([A, B, C], 'max', txs).joint, 900000);
  assert.equal(yearlyYield(C, txs), 67500);
  assert.equal(groupItems([A, B, C], 'people', 'max', txs)[0].total, 150000);
});
test('linkedTxs, savedFromWallets, checkMove', () => {
  const txs = [{ ...tx('1', 'a', 500, 1), date: '2026-01-01' }, { ...tx('2', 'a', -200, 2), date: '2026-02-01' }, { ...tx('3', 'a', 100, 3), date: '2026-03-01' }, tx('4', 'b', 1, 4)];
  assert.deepEqual(linkedTxs(A, txs, 2).map((t) => t.id), ['3', '2']);
  assert.equal(savedFromWallets(A, txs), 400);
  assert.ok(checkMove(0, 1, 100));
  assert.ok(checkMove(101, 1, 100));
  assert.equal(checkMove(100, 1, 100), '');
  assert.ok(checkMove(5, -1, 4));
});
test('график учитывает связанные операции', () => {
  const day = 86400000, t0 = new Date(2026, 0, 10, 12).getTime();
  const x = { ...A, amount: 100, baseAt: t0, history: [{ at: t0, amount: 100 }] };
  const txs = [tx('1', 'a', 50, t0 + day), tx('2', 'a', 25, t0 + 2 * day)];
  assert.deepEqual(chartSeries([x], 'max', txs).map((p) => p.amount), [100, 150, 175]);
  assert.equal(balanceOf(x, txs), 175);
});
