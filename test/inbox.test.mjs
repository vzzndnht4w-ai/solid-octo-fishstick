import test from 'node:test';
import assert from 'node:assert/strict';
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
const I = await import('../lib/inbox.js');
const { defaults } = await import('../store.js');

const ctx = { name: (p) => (p === 'max' ? 'Максим' : 'Динара'), fem: (p) => (p === 'dinara' ? 'а' : ''), money: (k) => `${k / 100} ₽` };
const state = () => ({ ...defaults(), viewer: 'max' });
const tx = (o) => ({ id: 't1', type: 'expense', person: 'dinara', scope: 'personal', category: 'Продукты', amount: 45000, date: '2026-11-05', ...o });
const rec = (id, data, u = Date.now(), deleted = false) => ({ id, data, deleted, u });
const rem = (applied, s = state()) => I.remoteEvents(applied, { state: s, viewer: 'max', today: '2026-11-05', now: Date.now() });

test('партнёр добавил операцию: текст с деталями', () => {
  const [e] = rem([rec('tx:t1', tx())]);
  assert.equal(I.describe(e, ctx).text, 'Динара добавила операцию · 450 ₽ · Продукты');
  assert.equal(e.route, 'tx'); assert.equal(e.arg, 't1');
});
test('скрытая операция партнёра не раскрывает детали', () => {
  const [e] = rem([rec('tx:t2', tx({ id: 't2', hidden: true, note: 'кольцо' }))]);
  const d = I.describe(e, ctx);
  assert.ok(!JSON.stringify(e).includes('Продукты') && !JSON.stringify(e).includes('45000'));
  assert.equal(d.title, 'Динара добавила операцию'); assert.equal(d.detail, 'Детали скрыты');
  const [r] = rem([rec('tx:t3', tx({ id: 't3', hidden: true, revealOn: '2026-11-01' }))]);
  assert.ok(!r.d.secret);
});
test('собственные действия и удаления не создают событий', () => {
  assert.equal(rem([rec('tx:t1', tx({ person: 'max' }))]).length, 0);
  assert.equal(rem([rec('tx:t1', null, 1, true)]).length, 0);
  assert.equal(rem([rec('col:comments:a', { id: 'a', txId: 't1', person: 'max', emoji: '❤️', at: 1 })]).length, 0);
});
test('общая трата, оплаченная партнёром, пополнение баланса, цель, взаиморасчёт', () => {
  const s = state(); s.goals = [{ id: 'g1', name: 'Отпуск', target: 100000 }];
  const ev = rem([
    rec('tx:a', tx({ id: 'a', scope: 'shared', paidFrom: 'dinara', shareMax: 50 })),
    rec('tx:b', { id: 'b', type: 'transfer', from: 'dinara', to: 'joint', amount: 100000 }),
    rec('tx:c', { id: 'c', type: 'transfer', from: 'dinara', to: 'joint', goalId: 'g1', amount: 50000 }),
    rec('tx:d', { id: 'd', type: 'transfer', from: 'dinara', to: 'max', amount: 20000 }),
  ], s);
  assert.deepEqual(ev.map((e) => e.type), ['shared', 'pot', 'goalfund', 'settle']);
  assert.match(I.describe(ev[0], ctx).text, /оплатила общую трату · 450 ₽ · Продукты · ваша доля 225 ₽/);
  assert.match(I.describe(ev[2], ctx).title, /цель «Отпуск»/);
});
test('реакции, комментарии, цели, бюджеты, свидание', () => {
  const s = state(); s.txs = [tx()];
  const ev = rem([
    rec('col:comments:c1', { id: 'c1', txId: 't1', person: 'dinara', emoji: '❤️', at: 5 }, 5),
    rec('col:comments:c2', { id: 'c2', txId: 't1', person: 'dinara', text: 'Вкусно!', at: 6 }, 6),
    rec('goal:g1', { id: 'g1', name: 'Отпуск', target: 100000 }, 7),
    rec('bud:Продукты', { c: 'Продукты', v: 3000000 }, 8),
    rec('col:dateNotes:n1', { id: 'n1', week: '2026-W45', person: 'dinara', kind: 'answer', text: 'x', at: 9 }, 9),
    rec('col:dateNotes:n2', { id: 'n2', week: '2026-W45', person: 'dinara', kind: 'thanks', text: 'y', at: 9 }, 9),
  ], s);
  const box = I.emptyInbox(); I.addEvents(box, ev);
  assert.equal(box.items.length, 5, 'две заметки свидания объединяются');
  const texts = box.items.map((e) => I.describe(e, ctx).title);
  assert.ok(texts.includes('Динара отреагировала ❤️'));
  assert.ok(texts.includes('Динара прокомментировала операцию'));
  assert.ok(texts.includes('Динара записала ответ на финансовом свидании'));
  assert.ok(!JSON.stringify(box).includes('"y"'), 'текст заметок свидания не сохраняется');
});
test('дедупликация и лимит 200', () => {
  const box = I.emptyInbox(), e = { key: 'k', kind: 'partner', type: 'pot', who: 'dinara', at: 1, d: { amount: 1 } };
  assert.equal(I.addEvents(box, [e, e]).length, 1);
  assert.equal(I.addEvents(box, [e]).length, 0);
  I.hide(box, 'k'); assert.equal(I.addEvents(box, [e]).length, 0, 'скрытое не возвращается');
  I.addEvents(box, Array.from({ length: 250 }, (_, i) => ({ ...e, key: 'x' + i, at: 10 + i })));
  assert.equal(box.items.length, 200); assert.equal(box.items[0].key, 'x249');
});
test('прочитано, фильтр', () => {
  const box = I.emptyInbox();
  I.addEvents(box, [{ key: 'a', kind: 'partner', type: 'pot', who: 'dinara', at: 1, d: {} }, { key: 'b', kind: 'reminder', type: 'datenight', at: 2, d: {} }]);
  assert.equal(I.unreadCount(box), 2); I.markRead(box, 'a'); assert.equal(I.unreadCount(box), 1);
  assert.equal(I.filterItems(box, 'reminder').length, 1); assert.equal(I.filterItems(box, 'partner')[0].key, 'a');
  I.markAllRead(box); assert.equal(I.unreadCount(box), 0);
});
test('хранилище: у каждого человека своя лента', () => {
  const a = I.emptyInbox(); I.addEvents(a, [{ key: 'a', kind: 'partner', type: 'pot', who: 'dinara', at: 1, d: {} }]);
  I.save('max', a);
  assert.equal(I.load('max').items.length, 1); assert.equal(I.load('dinara').items.length, 0);
  assert.equal(JSON.parse(mem[I.KEY]).max.items[0].key, 'a');
});
test('локальные напоминания: бюджет 90/100, платёж завтра, цель, свидание', () => {
  const s = state(); s.settings.onboarded = true;
  s.budgets = { Продукты: 100000, Транспорт: 100000 };
  s.txs = [tx({ id: 'e1', person: 'max', amount: 92000 }), tx({ id: 'e2', person: 'max', category: 'Транспорт', amount: 100000 })];
  s.recurring = [{ id: 'r1', day: 6, active: true, lastRun: '2026-10', tpl: { type: 'expense', amount: 5000000, category: 'Жильё', note: 'Аренда' } }];
  s.goals = [{ id: 'g1', name: 'Отпуск', target: 1000 }];
  s.txs.push({ id: 'tt', type: 'transfer', from: 'max', to: 'joint', goalId: 'g1', amount: 1000, date: '2026-11-01' });
  const sun = new Date(2026, 10, 8, 18, 0);
  const ev = I.localEvents({ state: s, viewer: 'max', today: '2026-11-08', now: sun });
  const types = ev.map((e) => e.type);
  assert.ok(types.includes('budget100') && types.includes('goaldone') && types.includes('datenight'));
  const ev2 = I.localEvents({ state: s, viewer: 'max', today: '2026-11-05', now: new Date(2026, 10, 5, 10) });
  assert.ok(ev2.some((e) => e.type === 'budget90' && e.d.pct === 92));
  const rc = ev2.find((e) => e.type === 'recurring');
  assert.equal(I.describe(rc, ctx).title, 'Завтра платёж: Аренда');
  assert.ok(!ev2.some((e) => e.type === 'datenight'));
});
test('долг висит давно', () => {
  const s = state();
  s.txs = [tx({ id: 'd1', person: 'max', scope: 'shared', paidFrom: 'max', shareMax: 50, amount: 1000000, date: '2026-10-01' })];
  const ev = I.localEvents({ state: s, viewer: 'max', today: '2026-11-05', now: new Date(2026, 10, 5, 10) });
  const d = ev.find((e) => e.type === 'debt');
  assert.ok(d); assert.match(I.describe(d, ctx).title, /Долг висит уже 35 дней/);
});
test('refreshLocal: повторов нет, не чаще раза в минуту', () => {
  const s = state(); s.settings.onboarded = true; s.budgets = { Продукты: 100000 }; s.txs = [tx({ person: 'max', amount: 120000 })];
  I.bindSource(() => ({ state: s, viewer: 'max', today: '2026-11-05' }));
  const t = new Date(2026, 10, 5, 10);
  assert.equal(I.refreshLocal(false, t).length, 1);
  assert.equal(I.refreshLocal(false, new Date(t.getTime() + 1000)).length, 0);
  assert.equal(I.refreshLocal(false, new Date(t.getTime() + 120000)).length, 0, 'тот же ключ — без повтора');
  assert.equal(I.load('max').items.filter((e) => e.type === 'budget100').length, 1);
});
test('onRemoteApplied пишет в ленту и оповещает', () => {
  const s = state(); I.bindSource(() => ({ state: s, viewer: 'max', today: '2026-11-05' }));
  let got = 0; I.subscribe(({ added }) => { got += added.length; });
  I.onRemoteApplied([rec('tx:zz', tx({ id: 'zz' }))]);
  assert.equal(got, 1); assert.ok(I.load('max').items.some((e) => e.key === 'tx:zz'));
});
test('родительный падеж имён', () => {
  assert.deepEqual(['Динара', 'Максим', 'Настя', 'Катя', 'Лёша', 'Сергей', 'Ольга', 'Саша'].map(I.genitive), ['Динары', 'Максима', 'Насти', 'Кати', 'Лёши', 'Сергея', 'Ольги', 'Саши']);
});
