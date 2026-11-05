import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceSeries, rangeDelta, chartPoints, smoothPath } from '../lib/series.js';

const inc = (date, amount, wallet = 'joint') => ({ id: date + amount, type: 'income', person: 'max', wallet, amount, date });
const exp = (date, amount, paidFrom = 'joint', extra = {}) => ({ id: date + 'e' + amount, type: 'expense', person: 'max', scope: 'shared', shareMax: 50, paidFrom, amount, date, ...extra });
const tr = (date, from, to, amount, extra = {}) => ({ id: date + from + to, type: 'transfer', from, to, amount, date, ...extra });
const vals = (txs, days, end) => balanceSeries(txs, { days, end }).map((p) => p.value);

test('пустые данные и неверные параметры', () => {
  assert.deepEqual(vals([], 3, '2026-11-05'), [0, 0, 0]);
  assert.deepEqual(balanceSeries([], { days: 0, end: '2026-11-05' }), []);
  assert.deepEqual(balanceSeries([], { days: 7 }), []);
  assert.deepEqual(balanceSeries([], { days: 7, end: 'вчера' }), []);
});

test('окно из days дней подряд через границу месяца, включая пустые', () => {
  const s = balanceSeries([], { days: 4, end: '2026-03-02' });
  assert.deepEqual(s.map((p) => p.date), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
});

test('остаток накапливается: операции до окна входят в начальный остаток', () => {
  const txs = [inc('2026-10-01', 100000), inc('2026-11-04', 50000), exp('2026-11-05', 20000)];
  assert.deepEqual(vals(txs, 3, '2026-11-05'), [100000, 150000, 130000]);
});

test('считается только общий баланс: личные кошельки не влияют', () => {
  const txs = [inc('2026-11-05', 70000, 'max'), exp('2026-11-05', 10000, 'max'), inc('2026-11-05', 30000)];
  assert.deepEqual(vals(txs, 1, '2026-11-05'), [30000]);
});

test('переводы в общий баланс и из него; карта и наличные суммируются', () => {
  const txs = [tr('2026-11-04', 'max', 'joint', 40000), tr('2026-11-05', 'joint', 'dinara', 15000, { fromMethod: 'cash' }), tr('2026-11-05', 'dinara', 'joint', 5000, { toMethod: 'cash' })];
  assert.deepEqual(vals(txs, 2, '2026-11-05'), [40000, 30000]);
});

test('будущие операции не попадают в ряд', () => {
  assert.deepEqual(vals([inc('2026-11-05', 1000), inc('2026-11-06', 9000)], 2, '2026-11-05'), [0, 1000]);
});

test('скрытые операции партнёра учитываются как деньги', () => {
  assert.deepEqual(vals([exp('2026-11-05', 5000, 'joint', { hidden: true, revealOn: '2027-01-01' })], 1, '2026-11-05'), [-5000]);
});

test('один день', () => {
  assert.deepEqual(balanceSeries([inc('2026-11-05', 700)], { days: 1, end: '2026-11-05' }), [{ date: '2026-11-05', value: 700 }]);
});

test('rangeDelta: рост, падение, пустой ряд, нулевая база', () => {
  const ser = (...v) => v.map((value, i) => ({ date: `d${i}`, value }));
  assert.deepEqual(rangeDelta(ser(100000, 112400)), { amount: 12400, pct: 12.4 });
  assert.deepEqual(rangeDelta(ser(200, 100)), { amount: -100, pct: -50 });
  assert.deepEqual(rangeDelta([]), { amount: 0, pct: 0 });
  assert.deepEqual(rangeDelta(ser(500)), { amount: 0, pct: 0 });
  assert.deepEqual(rangeDelta(ser(0, 0)), { amount: 0, pct: 0 });
  assert.deepEqual(rangeDelta(ser(0, 900)), { amount: 900, pct: null });
});

test('chartPoints: границы, ровный ряд по центру, одна точка, пусто', () => {
  const pts = chartPoints([{ date: 'a', value: 0 }, { date: 'b', value: 10 }], { w: 100, h: 100, padX: 10, top: 20, bottom: 10 });
  assert.deepEqual(pts.map((p) => [p.x, p.y]), [[10, 90], [90, 20]]);
  assert.equal(chartPoints([{ date: 'a', value: 5 }, { date: 'b', value: 5 }], { w: 100, h: 100 })[0].y, 55);
  assert.equal(chartPoints([{ date: 'a', value: 5 }], { w: 100, h: 100 })[0].x, 50);
  assert.deepEqual(chartPoints([], { w: 100, h: 100 }), []);
});

test('smoothPath: начинается с M, по сегменту на каждый интервал', () => {
  const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]);
  assert.match(d, /^M0 0 C/);
  assert.equal((d.match(/C/g) || []).length, 2);
  assert.equal(smoothPath([]), '');
});

test('smoothPath: кривая не выходит за вертикальные границы соседних точек (нет провала перед скачком)', () => {
  const pts = [{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 20, y: 100 }, { x: 30, y: 10 }, { x: 40, y: 10 }];
  const nums = smoothPath(pts).match(/-?\d+(\.\d+)?/g).map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);   // пары x y
  assert.ok(Math.min(...ys) >= 10 && Math.max(...ys) <= 100);
});
