import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftYm, monthlySeries, potSeries, categoryTotals, dailyAverage, forecast, elapsedDays, insights, compactMoney, niceScale } from '../lib/analytics.js';
import { toCsv, parseBackup, dataSummary } from '../lib/exporter.js';

const inc = (date, amount, o = {}) => ({ type: 'income', date, amount, person: 'max', wallet: 'max', method: 'card', ...o });
const exp = (date, amount, category, o = {}) => ({ type: 'expense', date, amount, category, scope: 'personal', person: 'max', paidFrom: 'max', method: 'card', ...o });

test('shiftYm переходит через год', () => {
  assert.equal(shiftYm('2026-01', -1), '2025-12');
  assert.equal(shiftYm('2026-11', 3), '2027-02');
});

test('monthlySeries: n месяцев по возрастанию, пустые месяцы нули', () => {
  const s = monthlySeries([inc('2026-11-01', 1000), exp('2026-11-02', 300, 'Продукты'), exp('2026-09-02', 50, 'Продукты'), exp('2025-01-01', 9, 'x')], '2026-11', 3);
  assert.deepEqual(s.map((m) => m.ym), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(s.map((m) => [m.income, m.expense, m.net]), [[0, 50, -50], [0, 0, 0], [1000, 300, 700]]);
});

test('potSeries: баланс накопительно; без баланса — суммарный баланс', () => {
  const tr = { type: 'transfer', date: '2026-10-05', amount: 400, from: 'max', to: 'joint', fromMethod: 'card', toMethod: 'card' };
  const p = potSeries([inc('2026-09-01', 1000), tr, exp('2026-11-03', 100, 'Продукты', { scope: 'shared', paidFrom: 'joint', shareMax: 50 })], '2026-11', 3);
  assert.equal(p.kind, 'joint');
  assert.deepEqual(p.points.map((x) => x.value), [0, 400, 300]);
  const q = potSeries([inc('2026-10-01', 1000)], '2026-11', 2);
  assert.equal(q.kind, 'total');
  assert.deepEqual(q.points.map((x) => x.value), [1000, 1000]);
});

test('categoryTotals: фильтры scope/who, скрытые чужие исключены', () => {
  const txs = [
    exp('2026-11-01', 1000, 'Продукты', { scope: 'shared', paidFrom: 'max', shareMax: 60 }),
    exp('2026-11-02', 500, 'Одежда', { person: 'dinara', paidFrom: 'dinara' }),
    exp('2026-11-03', 700, 'Подарки', { person: 'dinara', paidFrom: 'dinara', hidden: true }),
    exp('2026-10-03', 999, 'Машина'),
  ];
  const base = { ym: '2026-11', viewer: 'max' };
  assert.deepEqual(categoryTotals(txs, base), [['Продукты', 1000], ['Одежда', 500]]);
  assert.deepEqual(categoryTotals(txs, { ...base, scope: 'shared' }), [['Продукты', 1000]]);
  assert.deepEqual(categoryTotals(txs, { ...base, who: 'me' }), [['Продукты', 600]]);
  assert.deepEqual(categoryTotals(txs, { ...base, who: 'other' }), [['Одежда', 500], ['Продукты', 400]]);
  assert.deepEqual(categoryTotals(txs, { ...base, viewer: 'dinara' }).map((c) => c[0]), ['Продукты', 'Подарки', 'Одежда']);
});

test('dailyAverage и forecast', () => {
  const txs = [exp('2026-11-01', 1000, 'a'), exp('2026-11-03', 500, 'b'), exp('2026-10-10', 3100, 'c')];
  assert.equal(elapsedDays('2026-11', '2026-11-04'), 4);
  assert.equal(dailyAverage(txs, '2026-11', '2026-11-04'), 375);
  assert.equal(forecast(txs, '2026-11', '2026-11-04'), 375 * 30);
  assert.equal(dailyAverage(txs, '2026-10', '2026-11-04'), 100);
  assert.equal(forecast(txs, '2026-10', '2026-11-04'), null);
  assert.equal(dailyAverage(txs, '2026-12', '2026-11-04'), null);
});

test('insights: мало данных — пусто; рост категории, баланс, крупнейшая трата', () => {
  assert.deepEqual(insights([exp('2026-11-01', 1000, 'a')], '2026-11', 'max'), []);
  const txs = [
    exp('2026-10-05', 100_00, 'Продукты'), exp('2026-11-05', 118_00, 'Продукты'),
    exp('2026-11-06', 250_00, 'Жильё'), inc('2026-11-01', 900_00),
    { type: 'transfer', date: '2026-11-02', amount: 50_00, from: 'max', to: 'joint', fromMethod: 'card', toMethod: 'card' },
  ];
  const r = insights(txs, '2026-11', 'max');
  assert.equal(r.length, 2);
  assert.match(r[0].text, /Продукты: на 18% больше/);
  assert.match(r[1].text, /Общий баланс пополнен/);
  const hiddenBig = [...txs, exp('2026-11-07', 9000_00, 'Подарки', { person: 'dinara', hidden: true })];
  assert.ok(!insights(hiddenBig, '2026-11', 'max').some((i) => /Подарки/.test(i.text)));
});

test('compactMoney и niceScale', () => {
  assert.equal(compactMoney(1250000), '12,5 тыс');
  assert.equal(compactMoney(340000000), '3,4 млн');
  assert.equal(compactMoney(0), '0');
  const sc = niceScale(8700000);
  assert.ok(sc.max >= 8700000 && sc.max % sc.step === 0);
});

test('toCsv: BOM, «;», маскирование скрытых, экранирование', () => {
  const txs = [
    exp('2026-11-02', 12345, 'Подарки', { person: 'dinara', paidFrom: 'dinara', hidden: true, note: 'секрет' }),
    exp('2026-11-01', 100, 'Продукты', { note: 'a;b "q"' }),
  ];
  const csv = toCsv(txs, { viewer: 'max' });
  assert.ok(csv.startsWith('﻿Дата;Тип;'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '01.11.2026;Расход;Продукты;-1,00;Максим;личное;Максим;карта;"a;b ""q"""');
  assert.match(lines[2], /;скрыто;-123,45;/);
  assert.ok(!csv.includes('секрет') && !csv.includes('Подарки'));
  assert.equal(toCsv(txs, { viewer: 'max', ym: '2026-10' }).trim().split('\r\n').length, 1);
});

test('parseBackup и dataSummary', () => {
  assert.throws(() => parseBackup('не json'), /JSON/);
  assert.throws(() => parseBackup('{"a":1}'), /списка операций/);
  assert.throws(() => parseBackup('{"txs":[{"type":"x"}]}'), /повреждённые/);
  assert.equal(parseBackup(JSON.stringify({ txs: [exp('2026-11-01', 5, 'a')] })).txs.length, 1);
  assert.deepEqual(dataSummary([exp('2026-11-01', 5, 'a'), exp('2026-03-09', 5, 'a')]), { count: 2, from: '2026-03-09', to: '2026-11-01' });
});
