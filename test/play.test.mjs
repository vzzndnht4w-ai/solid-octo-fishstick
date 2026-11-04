import test from 'node:test';
import assert from 'node:assert/strict';
import { dayStreak, weekday, addDays, visibleTxs, buildStory, challengeProgress, piggyTotal, piggyWeekNow, achievements, peakPot, doneChallenges, plural } from '../lib/play.js';

const inc = (date, amount, o = {}) => ({ type: 'income', date, amount, person: 'max', wallet: 'max', method: 'card', ...o });
const exp = (date, amount, category, o = {}) => ({ type: 'expense', date, amount, category, scope: 'personal', person: 'max', paidFrom: 'max', method: 'card', ...o });
const toPot = (date, amount, from = 'max', o = {}) => ({ type: 'transfer', date, amount, from, to: 'joint', fromMethod: 'card', toMethod: 'card', ...o });

test('даты: день недели и сдвиг', () => {
  assert.equal(weekday('2026-11-02'), 0); // понедельник
  assert.equal(weekday('2026-11-08'), 6);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(plural(2, 'день', 'дня', 'дней'), 'дня');
  assert.equal(plural(11, 'день', 'дня', 'дней'), 'дней');
});

test('dayStreak: серия до сегодня или вчера, лучшая серия', () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-10-20', '2026-10-21'];
  assert.deepEqual(dayStreak(days, '2026-11-03'), { current: 3, best: 3 });
  assert.deepEqual(dayStreak(days, '2026-11-04'), { current: 3, best: 3 }); // сегодня ещё не отмечено — серия жива
  assert.deepEqual(dayStreak(days, '2026-11-06'), { current: 0, best: 3 });
  assert.deepEqual(dayStreak([], '2026-11-06'), { current: 0, best: 0 });
});

test('visibleTxs: чужие скрытые отброшены', () => {
  const l = [exp('2026-11-01', 1, 'a'), exp('2026-11-01', 2, 'b', { hidden: true, person: 'dinara' }), exp('2026-11-01', 3, 'c', { hidden: true })];
  assert.deepEqual(visibleTxs(l, 'max').map((t) => t.amount), [1, 3]);
});

test('buildStory: пустой месяц — пусто; скрытые чужие не попадают', () => {
  assert.deepEqual(buildStory([], '2026-10', 'max'), []);
  const txs = [
    inc('2026-10-01', 100000_00), exp('2026-10-03', 500_00, 'Продукты'), exp('2026-10-04', 900_00, 'Еда вне дома'),
    exp('2026-10-05', 9999_00, 'Путешествия', { person: 'dinara', paidFrom: 'dinara', hidden: true }),
    exp('2026-10-06', 300_00, 'Продукты', { scope: 'shared', shareMax: 50, paidFrom: 'dinara', person: 'dinara' }),
    exp('2026-10-07', 200_00, 'Продукты', { scope: 'shared', shareMax: 50, paidFrom: 'dinara', person: 'dinara' }),
    toPot('2026-10-08', 5000_00),
  ];
  const cards = buildStory(txs, '2026-10', 'max');
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.deepEqual(cards.map((c) => c.id), ['numbers', 'biggest', 'favorite', 'payer', 'weekday', 'pot', 'verdict']);
  assert.equal(by.numbers.rows[1].value, 1900_00);
  assert.equal(by.biggest.big.value, 900_00);
  assert.equal(by.favorite.category, 'Продукты');
  assert.match(by.payer.text, /Динара/);
  assert.equal(by.pot.big.value, 5000_00);
  assert.match(by.verdict.text, /9\d%|плюсе/);
  // сама Динара видит свою скрытую трату
  assert.equal(buildStory(txs, '2026-10', 'dinara').find((c) => c.id === 'biggest').big.value, 9999_00);
});

test('buildStory: цели и вывод при перерасходе', () => {
  const goals = [{ id: 'g1', name: 'Отпуск', target: 1000_00, createdAt: 0 }];
  const txs = [inc('2026-10-01', 100_00), exp('2026-10-02', 500_00, 'Одежда'), exp('2026-10-03', 100_00, 'Продукты'), toPot('2026-10-04', 400_00, 'max', { goalId: 'g1' })];
  const c = buildStory(txs, '2026-10', 'max', { goals });
  const g = c.find((x) => x.id === 'goals');
  assert.equal(g.rows[0].value, 400_00);
  assert.equal(g.rows[0].pct, 0.4);
  assert.match(c.at(-1).text, /обогнали/);
});

test('challenge avoid: идёт, срыв, успех', () => {
  const ch = { id: 'c', type: 'avoid', startedAt: '2026-11-01', endsAt: '2026-11-07', params: { category: 'Еда вне дома' }, log: [] };
  const a = challengeProgress(ch, [exp('2026-11-02', 1, 'Продукты')], '2026-11-03');
  assert.equal(a.streak, 3); assert.ok(a.active && !a.failed);
  assert.ok(Math.abs(a.pct - 3 / 7) < 1e-9);
  const f = challengeProgress(ch, [exp('2026-11-03', 1, 'Еда вне дома', { person: 'dinara' })], '2026-11-04');
  assert.ok(f.failed && !f.active); assert.equal(f.failedBy, 'dinara'); assert.equal(f.contrib.dinara, 1); assert.equal(f.streak, 1);
  const ok = challengeProgress(ch, [], '2026-11-08');
  assert.ok(ok.done && ok.pct === 1 && !ok.active);
  assert.equal(challengeProgress(ch, [], '2026-11-07').done, false);
});

test('challenge nocash: серия сбрасывается наличными, цель по лучшей серии', () => {
  const ch = { id: 'c', type: 'nocash', startedAt: '2026-11-01', target: 5, params: {}, log: [] };
  const p = challengeProgress(ch, [exp('2026-11-04', 1, 'x', { method: 'cash' })], '2026-11-06');
  assert.equal(p.streak, 2); assert.equal(p.best, 3); assert.equal(p.done, false);
  assert.equal(challengeProgress(ch, [], '2026-11-05').done, true);
});

test('challenge weekend: считает завершённые выходные', () => {
  const ch = { id: 'c', type: 'weekend', startedAt: '2026-11-02', target: 2, params: {}, log: [] };
  // 7-8 ноября — выходные, 14-15 — следующие
  const p = challengeProgress(ch, [exp('2026-11-07', 1, 'x')], '2026-11-16');
  assert.equal(p.streak, 1); assert.equal(p.best, 1); assert.equal(p.done, false);
  assert.equal(challengeProgress(ch, [], '2026-11-16').done, true);
  assert.equal(challengeProgress(ch, [], '2026-11-08').best, 0); // воскресенье ещё не закончилось
});

test('challenge daily: стрик, вклад каждого, цель', () => {
  const log = [{ date: '2026-11-02', person: 'max', amount: 100 }, { date: '2026-11-03', person: 'dinara', amount: 100 }, { date: '2026-11-03', person: 'max', amount: 100 }, { date: '2026-11-04', person: 'max', amount: 100 }];
  const ch = { id: 'c', type: 'daily', startedAt: '2026-11-01', target: 4, params: { amount: 100 }, log };
  const p = challengeProgress(ch, [], '2026-11-04');
  assert.equal(p.streak, 3); assert.equal(p.contrib.max, 300); assert.equal(p.contrib.dinara, 100);
  assert.equal(p.done, false); assert.equal(p.doneToday.max, true); assert.equal(p.doneToday.dinara, false);
  assert.equal(challengeProgress({ ...ch, target: 3 }, [], '2026-11-04').done, true);
});

test('challenge piggy52: сумма, неделя, прогресс', () => {
  assert.equal(piggyTotal(100), 100 * 1378);
  const ch = { id: 'c', type: 'piggy52', startedAt: '2026-11-01', params: { step: 100 }, target: piggyTotal(100), log: [{ week: 1, person: 'max', amount: 100 }, { week: 2, person: 'dinara', amount: 200 }] };
  assert.equal(piggyWeekNow(ch, '2026-11-01'), 1);
  assert.equal(piggyWeekNow(ch, '2026-11-09'), 2);
  assert.equal(piggyWeekNow(ch, '2030-01-01'), 52);
  const p = challengeProgress(ch, [], '2026-11-09');
  assert.equal(p.streak, 2); assert.equal(p.saved, 300); assert.equal(p.contrib.dinara, 200);
  assert.ok(Math.abs(p.pct - 300 / 137800) < 1e-9);
  assert.equal(challengeProgress(ch, [], '2026-11-16').streak, 2); // неделя 3 ещё не отмечена — серия жива
});

test('achievements: котёл, серия, цель, бюджет, вдвоём, челленджи', () => {
  const base = { viewer: 'max', txs: [], goals: [], budgets: {}, challenges: [] };
  const ids = (s, today = '2026-11-20') => achievements(s, today).filter((a) => a.earned).map((a) => a.id);
  assert.deepEqual(ids(base), []);
  assert.equal(peakPot([toPot('2026-10-01', 500), { type: 'expense', date: '2026-10-02', amount: 400, paidFrom: 'joint', category: 'x' }]), 500);
  const txs = [toPot('2026-10-01', 1000_00, 'max'), toPot('2026-10-02', 9000_00, 'dinara'), exp('2026-10-03', 100_00, 'Продукты'),
    ...Array.from({ length: 7 }, (_, i) => exp(`2026-11-${String(10 + i).padStart(2, '0')}`, 1, 'Продукты'))];
  const s = { ...base, txs, goals: [{ id: 'g', name: 'a', target: 1000_00 }], budgets: { Продукты: 500_00 },
    challenges: [{ id: 'c1', type: 'avoid', startedAt: '2026-11-01', endsAt: '2026-11-07', params: { category: 'Одежда' }, log: [] }] };
  s.txs.push(toPot('2026-10-05', 100_00, 'max', { goalId: 'g' }), toPot('2026-10-06', 900_00, 'max', { goalId: 'g' }));
  assert.deepEqual(ids(s).sort(), ['budget', 'challenge', 'challenge-done', 'goal', 'pot10k', 'pot1k', 'streak7', 'together'].sort());
  // перерасход в октябре лишает бюджетного значка
  s.txs.push(exp('2026-10-09', 900_00, 'Продукты'));
  assert.ok(!ids(s).includes('budget'));
  assert.deepEqual(doneChallenges(s, '2026-11-20'), [{ id: 'c1', title: undefined }]);
});

test('achievements: чужие скрытые не засчитываются', () => {
  const s = { viewer: 'max', txs: [toPot('2026-10-01', 2000_00, 'dinara', { hidden: true, person: 'dinara' })], goals: [], budgets: {}, challenges: [] };
  assert.ok(!achievements(s, '2026-11-20').find((a) => a.id === 'pot1k').earned);
});
