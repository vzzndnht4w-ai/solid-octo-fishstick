import test from 'node:test';
import assert from 'node:assert/strict';
process.env.TZ = 'Europe/Moscow';   // фиксированный пояс UTC+3 (без перехода на летнее время)
const { generateVapidKeys, urlBase64ToUint8Array, isValidVapidPublic, buildReminders, normPrefs, shiftQuiet, eventsForPending } = await import('../lib/push-core.js');
const { makeInvite, parseInvite } = await import('../lib/sync-core.js');

const local = (iso) => { const d = new Date(iso); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), dow: d.getDay() }; };
const NOW = new Date(2026, 10, 5, 10, 0);   // четверг 5 ноября 2026, 10:00 МСК
const NODATE = { date: { on: false } };
const rec = (day, o = {}) => ({ id: 'r' + day, day, active: true, lastRun: null, createdAt: '2026-01-01', tpl: { type: 'expense', amount: 99999900, category: 'Секретная категория', note: 'Секретная заметка' }, ...o });

test('VAPID: публичный 65 байт с 0x04, d 32 байта, base64url без паддинга', async () => {
  const k = await generateVapidKeys();
  const pub = urlBase64ToUint8Array(k.publicKey), d = urlBase64ToUint8Array(k.privateKey);
  assert.equal(pub.length, 65); assert.equal(pub[0], 4); assert.equal(d.length, 32);
  assert.match(k.publicKey, /^[A-Za-z0-9_-]+$/); assert.match(k.privateKey, /^[A-Za-z0-9_-]+$/);
  assert.ok(isValidVapidPublic(k.publicKey)); assert.ok(!isValidVapidPublic('abc'));
  assert.notEqual((await generateVapidKeys()).publicKey, k.publicKey);
});

test('VAPID: ключи согласованы (подпись приватным проверяется публичным)', async () => {
  const k = await generateVapidKeys(), s = globalThis.crypto.subtle;
  const pub = await s.importKey('raw', urlBase64ToUint8Array(k.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const jwk = await s.exportKey('jwk', pub);
  const priv = await s.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: k.privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await s.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new Uint8Array([1, 2, 3]));
  assert.ok(await s.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, new Uint8Array([1, 2, 3])));
});

test('urlBase64ToUint8Array: паддинг и url-символы', () => {
  assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255]);
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
});

test('normPrefs: пустые и битые настройки получают значения по умолчанию', () => {
  const p = normPrefs(undefined);
  assert.equal(p.enabled, false); assert.equal(p.date.dow, 0); assert.equal(p.date.hour, 19); assert.deepEqual(p.quiet, { from: 22, to: 8 });
  assert.equal(normPrefs({ date: { hour: 99 } }).date.hour, 19);
  assert.equal(normPrefs({ date: { hour: 7, dow: 5 } }).date.dow, 5);
});

test('shiftQuiet: ночь переносится на 08:00 того же или следующего дня', () => {
  const q = { from: 22, to: 8 };
  assert.deepEqual(local(shiftQuiet(new Date(2026, 10, 5, 23, 0), q).toISOString()), { y: 2026, m: 11, d: 6, h: 8, dow: 5 });
  assert.deepEqual(local(shiftQuiet(new Date(2026, 10, 5, 6, 0), q).toISOString()), { y: 2026, m: 11, d: 5, h: 8, dow: 4 });
  assert.equal(shiftQuiet(new Date(2026, 10, 5, 12, 0), q).getHours(), 12);
});

test('свидание: раз в неделю в выбранный день и час, по умолчанию вс 19:00 МСК', () => {
  const r = buildReminders({ txs: [], recurring: [] }, NOW, {}).filter((x) => x.tag.startsWith('date-'));
  assert.equal(r.length, 2);
  for (const x of r) { const l = local(x.fire_at); assert.equal(l.dow, 0); assert.equal(l.h, 19); }
  assert.equal(r[0].fire_at, '2026-11-08T16:00:00.000Z');
  assert.equal(new Date(r[1].fire_at) - new Date(r[0].fire_at), 7 * 86400000);
});

test('свидание: в тихие часы переносится на 08:00', () => {
  const r = buildReminders({ txs: [] }, NOW, { date: { on: true, dow: 6, hour: 23 } }).filter((x) => x.tag.startsWith('date-'));
  assert.ok(r.length >= 1);
  const l = local(r[0].fire_at); assert.equal(l.h, 8); assert.equal(l.dow, 0);
});

test('платёж: за день до (19:00) и в день (09:00), без сумм и категорий', () => {
  const r = buildReminders({ txs: [], recurring: [rec(8)] }, NOW, NODATE);
  assert.equal(r.length, 2);
  assert.equal(r[0].title, 'Завтра регулярный платёж'); assert.deepEqual([local(r[0].fire_at).d, local(r[0].fire_at).h], [7, 19]);
  assert.equal(r[1].title, 'Сегодня регулярный платёж'); assert.deepEqual([local(r[1].fire_at).d, local(r[1].fire_at).h], [8, 9]);
  assert.ok(!/Секретн|99999900|999999/.test(JSON.stringify(r)));
});

test('платёж: сегодняшний ещё не наступивший включается, прошедший нет; неактивный и выключенный пропускаются', () => {
  const today = buildReminders({ txs: [], recurring: [rec(5)] }, new Date(2026, 10, 5, 7, 0), NODATE);
  assert.ok(today.some((x) => x.tag === 'pay-2026-11-05-day'));
  const late = buildReminders({ txs: [], recurring: [rec(5)] }, NOW, NODATE);
  assert.ok(!late.some((x) => x.tag === 'pay-2026-11-05-day'));
  assert.equal(buildReminders({ txs: [], recurring: [rec(8, { active: false })] }, NOW, NODATE).length, 0);
  assert.equal(buildReminders({ txs: [], recurring: [rec(8)] }, NOW, { ...NODATE, payments: false }).length, 0);
});

test('платёж: за горизонтом 14 дней не планируется', () => {
  assert.equal(buildReminders({ txs: [], recurring: [rec(25)] }, NOW, NODATE).length, 0);
});

const debtTx = (date, amount = 500000) => ({ id: 'd' + date, type: 'expense', scope: 'shared', person: 'max', paidFrom: 'max', shareMax: 50, amount, date, createdAt: 1, category: 'Продукты' });

test('долг: напоминание раз в неделю, если >1000 ₽ и старше 14 дней', () => {
  const r = buildReminders({ txs: [debtTx('2026-10-01')] }, NOW, NODATE);
  assert.equal(r.length, 2); assert.ok(r.every((x) => x.tag.startsWith('debt-') && local(x.fire_at).dow === 3));
  assert.ok(!/₽|\d{3}/.test(r[0].body));
});

test('долг: свежий, маленький или выключенный не напоминает', () => {
  assert.equal(buildReminders({ txs: [debtTx('2026-11-05')] }, NOW, NODATE).length, 0);
  assert.equal(buildReminders({ txs: [debtTx('2026-10-01', 100000)] }, NOW, NODATE).length, 0);
  assert.equal(buildReminders({ txs: [debtTx('2026-10-01')] }, NOW, { ...NODATE, debt: false }).length, 0);
});

test('вечер: выключено по умолчанию; включено — сегодня только без операций', () => {
  assert.equal(buildReminders({ txs: [] }, NOW, NODATE).length, 0);
  const on = { ...NODATE, evening: { on: true, hour: 21 } };
  const a = buildReminders({ txs: [] }, NOW, on);
  assert.equal(a.length, 14); assert.equal(a[0].tag, 'eve-2026-11-05');
  const b = buildReminders({ txs: [{ id: 'x', date: '2026-11-05', type: 'expense' }] }, NOW, on);
  assert.equal(b.length, 13); assert.ok(!b.some((x) => x.tag === 'eve-2026-11-05'));
});

test('вечер: часовой пояс (21:00 МСК = 18:00Z); в тихих часах уходит на утро', () => {
  const a = buildReminders({ txs: [] }, NOW, { ...NODATE, evening: { on: true, hour: 21 } });
  assert.equal(a[0].fire_at, '2026-11-05T18:00:00.000Z');
  const q = buildReminders({ txs: [] }, NOW, { ...NODATE, evening: { on: true, hour: 23 } });
  assert.equal(local(q[0].fire_at).h, 8);
});

test('результат отсортирован, не больше 100, поля заполнены', () => {
  const recs = Array.from({ length: 28 }, (_, i) => rec(i + 1));
  const r = buildReminders({ txs: [], recurring: recs }, NOW, { evening: { on: true, hour: 20 } });
  assert.ok(r.length <= 100);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].fire_at <= r[i].fire_at);
  for (const x of r) assert.ok(x.title && x.body && x.url && x.tag && !isNaN(new Date(x.fire_at)));
});

test('eventsForPending: свои новые операции и реакции; скрытые и повторные нет', () => {
  const tx = (id, o = {}) => ({ id: 'tx:' + id, data: { person: 'max', ...o } });
  assert.equal(eventsForPending([tx('1')], { person: 'max', name: 'Максим' })[0].body, 'Максим добавил операцию');
  assert.equal(eventsForPending([tx('1')], { person: 'max', name: 'Динара', female: true })[0].body, 'Динара добавила операцию');
  assert.deepEqual(eventsForPending([tx('1', { hidden: true })], { person: 'max' }), []);
  assert.deepEqual(eventsForPending([tx('1', { person: 'dinara' })], { person: 'max' }), []);
  assert.deepEqual(eventsForPending([tx('1')], { person: 'max', seen: new Set(['tx:1']) }), []);
  assert.deepEqual(eventsForPending([{ id: 'tx:1', deleted: true, data: null }], { person: 'max' }), []);
  assert.deepEqual(eventsForPending([tx('1', { recurringId: 'r' })], { person: 'max' }), []);
  const e = eventsForPending([{ id: 'col:comments:c1', data: { person: 'max', emoji: '❤️' } }], { person: 'max', name: 'Макс' });
  assert.equal(e[0].kind, 'react');
  assert.deepEqual(eventsForPending([tx('1')], { person: 'max', prefs: { partnerAdds: false } }), []);
});

test('diagnose: понятные сообщения для типичных ошибок', async () => {
  const { diagnose } = await import('../lib/push-core.js');
  assert.equal(diagnose('rpc', { status: 204 }), null);
  assert.match(diagnose('rpc', { status: 404 }), /таблиц/);
  assert.match(diagnose('fn', { status: 404, body: {} }), /не найдена/);
  assert.match(diagnose('fn', { status: 404, body: { error: 'no_room' } }), /Пара/);
  assert.match(diagnose('fn', { status: 401 }), /401/);
  assert.match(diagnose('fn', { status: 500 }), /секрет/);
  assert.match(diagnose('fn', { network: true }), /связи/);
});

test('приглашение: необязательный VAPID-ключ, старые ссылки работают', () => {
  const base = { url: 'https://a.supabase.co', key: 'sb_publishable_x', code: 'AAAA-BBBB' };
  assert.deepEqual(parseInvite(makeInvite('https://x/', base)), base);
  assert.equal(parseInvite(makeInvite('https://x/', { ...base, vapid: 'BPub' })).vapid, 'BPub');
  const old = 'https://x/#join=' + Buffer.from(JSON.stringify({ u: base.url, k: base.key, c: base.code })).toString('base64url');
  assert.deepEqual(parseInvite(old), base);
});
