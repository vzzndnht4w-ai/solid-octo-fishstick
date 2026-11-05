import test from 'node:test';
import assert from 'node:assert/strict';
import { fairShare, contributions, fairnessDelta, monthIncomes, weekKey, weekRange, shiftWeek, weekSummary, surprisingExpense, questionFor, QUESTIONS, applyNote, canSeePartner, applyComment, reactedCount } from '../lib/together.js';

const inc = (person, amount, date = '2026-10-05') => ({ id: `i${person}${amount}${date}`, type: 'income', person, amount, date, wallet: person, method: 'card' });
const sh = (paidFrom, amount, date = '2026-10-10', extra = {}) => ({ id: `s${paidFrom}${amount}${date}`, type: 'expense', scope: 'shared', person: paidFrom === 'joint' ? 'max' : paidFrom, paidFrom, amount, shareMax: 50, category: 'Продукты', date, method: 'card', ...extra });
const tr = (from, to, amount, date = '2026-10-12') => ({ id: `t${from}${to}${amount}`, type: 'transfer', from, to, amount, date });

test('fairShare: доли по доходам', () => {
  assert.deepEqual(fairShare({ max: 60000, dinara: 40000 }), { max: 0.6, dinara: 0.4 });
  assert.equal(fairShare({ max: 0, dinara: 0 }), null);
  assert.deepEqual(fairShare({ max: 0, dinara: 5 }), { max: 0, dinara: 1 });
});

test('contributions: общие траты из своего кошелька и переводы в баланс', () => {
  const txs = [sh('max', 1000), sh('dinara', 500), sh('joint', 9999), tr('dinara', 'joint', 300), tr('max', 'dinara', 700), tr('joint', 'max', 50),
    { ...sh('max', 100, '2026-10-11'), scope: 'personal' }, sh('max', 800, '2026-09-30')];
  assert.deepEqual(contributions(txs, '2026-10'), { max: 1000, dinara: 800 });
});

test('fairnessDelta: дельты в сумме дают ноль', () => {
  const txs = [inc('max', 6000000), inc('dinara', 4000000), sh('dinara', 500000), sh('max', 100000)];
  const f = fairnessDelta(txs, '2026-10');
  assert.equal(f.total, 600000);
  assert.deepEqual(f.fair, { max: 360000, dinara: 240000 });
  assert.equal(f.delta.max + f.delta.dinara, 0);
  assert.equal(f.lead, 'dinara'); assert.equal(f.under, 'max'); assert.equal(f.amount, 260000); assert.equal(f.level, 'off');
});

test('fairnessDelta: нет данных — null; почти поровну — even', () => {
  assert.equal(fairnessDelta([], '2026-10'), null);
  assert.equal(fairnessDelta([inc('max', 100)], '2026-10'), null);
  assert.equal(fairnessDelta([sh('max', 100)], '2026-10'), null);
  const f = fairnessDelta([inc('max', 500000), inc('dinara', 500000), sh('max', 100000), sh('dinara', 100500)], '2026-10');
  assert.equal(f.level, 'even');
});

test('monthIncomes считает только месяц', () => {
  assert.deepEqual(monthIncomes([inc('max', 10), inc('max', 5, '2026-09-01')], '2026-10'), { max: 10, dinara: 0 });
});

test('недели ISO', () => {
  assert.equal(weekKey('2026-01-01'), '2026-W01');
  assert.equal(weekKey('2025-12-29'), '2026-W01');
  assert.equal(weekKey('2026-11-04'), '2026-W45');
  assert.equal(weekKey('2027-01-03'), '2026-W53');
  assert.deepEqual(weekRange('2026-W45'), { from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(weekRange('2026-W01'), { from: '2025-12-29', to: '2026-01-04' });
  assert.equal(shiftWeek('2026-W01', -1), '2025-W52');
  assert.equal(shiftWeek('2026-W45', 1), '2026-W46');
});

test('weekSummary', () => {
  const txs = [inc('max', 1000, '2026-11-03'), sh('max', 400, '2026-11-04'), { ...sh('dinara', 200, '2026-11-05'), scope: 'personal' }, sh('max', 999, '2026-11-09')];
  const r = weekSummary(txs, '2026-W45');
  assert.deepEqual(r.earned, { max: 1000, dinara: 0 });
  assert.deepEqual(r.spent, { max: 200, dinara: 200 + 200 });
  assert.equal(r.total, 600);
});

test('surprisingExpense: выброс по категории; чужое скрытое пропускается', () => {
  const hist = [sh('max', 10000, '2026-10-01'), sh('max', 12000, '2026-10-08'), sh('max', 11000, '2026-10-15')];
  const wk = [sh('max', 11000, '2026-11-03', { id: 'a' }), sh('dinara', 90000, '2026-11-04', { id: 'b' }), sh('dinara', 900000, '2026-11-05', { id: 'c', hidden: true })];
  assert.equal(surprisingExpense([...hist, ...wk], '2026-W45', 'max').tx.id, 'b');
  assert.equal(surprisingExpense([...hist, ...wk], '2026-W45', 'dinara').tx.id, 'c');
  assert.equal(surprisingExpense([], '2026-W45', 'max'), null);
});

test('вопросы: не меньше 30, ротация по неделям', () => {
  assert.ok(QUESTIONS.length >= 30);
  assert.equal(questionFor('2026-W45'), questionFor('2026-W45'));
  assert.notEqual(questionFor('2026-W45'), questionFor('2026-W46'));
});

test('заметки: сохранение, замена, удаление и видимость', () => {
  const n = [];
  applyNote(n, { week: '2026-W45', person: 'max', kind: 'answer', text: ' Привет ', at: 1 });
  applyNote(n, { week: '2026-W45', person: 'max', kind: 'answer', text: 'Новый', at: 2 });
  assert.equal(n.length, 1); assert.equal(n[0].text, 'Новый');
  assert.equal(canSeePartner(n, '2026-W45', 'dinara'), false);
  assert.equal(canSeePartner(n, '2026-W45', 'max'), true);
  applyNote(n, { week: '2026-W45', person: 'max', kind: 'answer', text: '  ', at: 3 });
  assert.equal(n.length, 0);
});

test('комментарии: реакция переключается, текст сохраняется, пустое удаляется', () => {
  const c = [];
  applyComment(c, { txId: 'x', person: 'max', emoji: '❤️', at: 1 });
  applyComment(c, { txId: 'x', person: 'max', text: 'Класс', at: 2 });
  assert.deepEqual([c[0].emoji, c[0].text, c.length], ['❤️', 'Класс', 1]);
  applyComment(c, { txId: 'x', person: 'max', emoji: '❤️', at: 3 });
  assert.equal(c[0].emoji, undefined); assert.equal(c[0].text, 'Класс');
  applyComment(c, { txId: 'x', person: 'max', text: '', at: 4 });
  assert.equal(c.length, 0);
});

test('reactedCount учитывает только существующие операции', () => {
  const c = [{ id: '1', txId: 'a', person: 'dinara', emoji: '👍' }, { id: '2', txId: 'b', person: 'dinara', text: 'x' }, { id: '3', txId: 'zz', person: 'dinara', emoji: '👍' }, { id: '4', txId: 'a', person: 'max', emoji: '👍' }];
  assert.equal(reactedCount(c, [{ id: 'a' }, { id: 'b' }], 'dinara'), 2);
});
