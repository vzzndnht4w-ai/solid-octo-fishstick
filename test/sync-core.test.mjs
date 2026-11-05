import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, stampLocal, applyRemote, deriveKeys, sealRecord, openRecord, newCode, makeInvite, parseInvite, normUrl, canon } from '../lib/sync-core.js';

const mkState = () => ({ txs: [], goals: [], recurring: [], budgets: {}, categories: { expense: [], income: [] }, profiles: { max: { name: 'Максим', female: false, color: 'blue' }, dinara: { name: 'Динара', female: true, color: 'rose' } }, settings: { currency: '₽', defaultShare: 50, defaultMethod: 'card' } });

/** Модель сервера в памяти: то же, что делает Supabase с шифрованными записями. */
class Server {
  rows = new Map(); clock = 0;
  async push(keys, recs) { for (const r of recs) { const row = await sealRecord(keys, r); this.rows.set(row.id, { ...row, srv: ++this.clock }); } }
  async pull(keys, since) { const out = []; for (const row of [...this.rows.values()].filter((r) => r.srv > since).sort((a, b) => a.srv - b.srv)) out.push([await openRecord(keys, row), row.srv]); return out; }
}
class Phone {
  constructor(server, keys) { this.s = mkState(); this.known = {}; this.cursor = 0; this.server = server; this.keys = keys; }
  async sync(now) {
    const pending = stampLocal(this.s, this.known, now, collect(mkState()));
    const got = await this.server.pull(this.keys, this.cursor);
    for (const [rec, srv] of got) { if (applyRemote(this.s, this.known, rec)) pending.delete(rec.id); this.cursor = Math.max(this.cursor, srv); }
    await this.server.push(this.keys, [...pending.values()]);
  }
}

test('шифрование: туда и обратно, сервер не видит содержимого', async () => {
  const keys = await deriveKeys('ABCD-EFGH');
  const row = await sealRecord(keys, { id: 'tx:1', data: { amount: 123, note: 'секрет' }, deleted: false, u: 5 });
  assert.ok(!JSON.stringify(row).includes('секрет') && !JSON.stringify(row).includes('tx:1'));
  const back = await openRecord(keys, { ...row, u: 5 });
  assert.deepEqual(back, { id: 'tx:1', data: { amount: 123, note: 'секрет' }, deleted: false, u: 5 });
  const other = await deriveKeys('ZZZZ-YYYY');
  await assert.rejects(() => openRecord(other, row));
  assert.notEqual(other.room, keys.room);
});

test('две «трубки»: операции доезжают в обе стороны', async () => {
  const keys = await deriveKeys(newCode()), srv = new Server();
  const a = new Phone(srv, keys), b = new Phone(srv, keys);
  a.s.txs.push({ id: 'a1', type: 'income', amount: 100 });
  await a.sync(1000); await b.sync(1100);
  b.s.txs.push({ id: 'b1', type: 'expense', amount: 5 });
  await b.sync(1200); await a.sync(1300);
  assert.deepEqual(a.s.txs.map((t) => t.id).sort(), ['a1', 'b1']);
  assert.deepEqual(b.s.txs.map((t) => t.id).sort(), ['a1', 'b1']);
});

test('удаление и правка распространяются; последняя правка побеждает', async () => {
  const keys = await deriveKeys('K'), srv = new Server();
  const a = new Phone(srv, keys), b = new Phone(srv, keys);
  a.s.txs.push({ id: 't', amount: 10 }, { id: 'u', amount: 20 });
  await a.sync(1000); await b.sync(1001);
  a.s.txs = a.s.txs.filter((t) => t.id !== 'u');          // A удаляет u
  b.s.txs.find((t) => t.id === 't').amount = 99;          // B правит t
  await a.sync(2000); await b.sync(2001); await a.sync(2002);
  assert.deepEqual(a.s.txs, [{ id: 't', amount: 99 }]);
  assert.deepEqual(b.s.txs, [{ id: 't', amount: 99 }]);
  // конфликт: обе правят t, B позже
  a.s.txs[0].amount = 1; b.s.txs[0].amount = 2;
  await a.sync(3000); await b.sync(3500); await a.sync(3600);
  assert.equal(a.s.txs[0].amount, 2); assert.equal(b.s.txs[0].amount, 2);
});

test('бюджеты, категории, профили и валюта синхронизируются', async () => {
  const keys = await deriveKeys('K2'), srv = new Server();
  const a = new Phone(srv, keys), b = new Phone(srv, keys);
  a.s.budgets['Продукты'] = 500000; a.s.categories.expense.push('Кофе'); a.s.profiles.max.name = 'Макс'; a.s.settings.currency = '$';
  await a.sync(1000); await b.sync(1001);
  assert.equal(b.s.budgets['Продукты'], 500000); assert.deepEqual(b.s.categories.expense, ['Кофе']);
  assert.equal(b.s.profiles.max.name, 'Макс'); assert.equal(b.s.settings.currency, '$');
  delete b.s.budgets['Продукты']; b.s.categories.expense = [];
  await b.sync(2000); await a.sync(2001);
  assert.equal(a.s.budgets['Продукты'], undefined); assert.deepEqual(a.s.categories.expense, []);
});

test('повторная синхронизация без правок ничего не отправляет', async () => {
  const keys = await deriveKeys('K3'), srv = new Server(), a = new Phone(srv, keys);
  a.s.txs.push({ id: 'x', amount: 1 }); await a.sync(1000);
  const before = srv.clock; await a.sync(2000); await a.sync(3000);
  assert.equal(srv.clock, before);
});

test('приглашение и код', () => {
  const c = newCode(); assert.match(c, /^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
  const link = makeInvite('https://x.github.io/app/', { url: 'https://p.supabase.co', key: 'k.e.y', code: c });
  assert.deepEqual(parseInvite(link), { url: 'https://p.supabase.co', key: 'k.e.y', code: c });
  assert.deepEqual(parseInvite(link.split('#join=')[1]), { url: 'https://p.supabase.co', key: 'k.e.y', code: c });
  assert.equal(parseInvite('мусор'), null);
  assert.equal(normUrl('abc.supabase.co/'), 'https://abc.supabase.co');
  assert.equal(normUrl('https://abc.supabase.co/rest/v1'), 'https://abc.supabase.co');
});

test('коллекции (комментарии, шаблоны…) синхронизируются как записи', async () => {
  const keys = await deriveKeys('K9'), srv = new Server();
  const a = new Phone(srv, keys), b = new Phone(srv, keys);
  a.s.comments = [{ id: 'c1', txId: 't', person: 'max', emoji: '❤' }]; a.s.templates = [{ id: 'm1', title: 'Кофе' }];
  await a.sync(1000); await b.sync(1001);
  assert.deepEqual(b.s.comments, [{ id: 'c1', txId: 't', person: 'max', emoji: '❤' }]); assert.equal(b.s.templates[0].title, 'Кофе');
  b.s.comments = []; await b.sync(2000); await a.sync(2001);
  assert.deepEqual(a.s.comments, []);
});

test('чужие записи: белые списки (профиль, настройки, прототип)', async () => {
  const st = mkState(), known = {};
  applyRemote(st, known, { id: 'prof:__proto__', data: { name: 'x' }, deleted: false, u: 1 });
  applyRemote(st, known, { id: 'bud:__proto__', data: { c: '__proto__', v: 5 }, deleted: false, u: 1 });
  applyRemote(st, known, { id: 'set:shared', data: { currency: '$', theme: 'hack', pins: { max: 'x' } }, deleted: false, u: 1 });
  assert.equal(Object.keys(st.profiles).join(), 'max,dinara');
  assert.equal({}.v, undefined);
  assert.equal(st.settings.currency, '$');
  assert.equal(st.settings.theme, undefined);
  assert.equal(st.settings.pins, undefined);
  assert.equal(parseInvite(makeInvite('https://x.io/', { url: 'http://evil.example', key: 'k', code: 'c' })), null);
  assert.ok(parseInvite(makeInvite('https://x.io/', { url: 'https://p.supabase.co', key: 'k', code: 'c' })));
});
