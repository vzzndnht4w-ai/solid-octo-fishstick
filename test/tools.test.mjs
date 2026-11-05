import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecret, isPendingSurprise, suggestTemplates, parseQuickLink, buildQuickLink, findTemplate, upcomingCharges, chargesTotals, skipLastRun, runway, debtAgeDays, incomeShare, txFromTemplate, templateFromTx, templateErrors, daysBetween, addDays, shortDate } from '../lib/tools.js';
import { categoryTotals } from '../lib/analytics.js';
import { toCsv } from '../lib/exporter.js';

const exp = (date, amount, category, o = {}) => ({ type: 'expense', date, amount, category, scope: 'shared', person: 'max', paidFrom: 'max', shareMax: 50, method: 'card', ...o });
const inc = (date, amount, person = 'max', o = {}) => ({ type: 'income', date, amount, person, wallet: person, method: 'card', ...o });

test('isSecret: чужая скрытая прячется, своя и открытая — нет', () => {
  const t = { hidden: true, person: 'max' };
  assert.equal(isSecret(t, 'dinara', '2026-01-01'), true);
  assert.equal(isSecret(t, 'max', '2026-01-01'), false);
  assert.equal(isSecret({ person: 'max' }, 'dinara', '2026-01-01'), false);
});
test('isSecret: после revealOn детали видны, в день раскрытия тоже', () => {
  const t = { hidden: true, person: 'max', revealOn: '2026-02-14' };
  assert.equal(isSecret(t, 'dinara', '2026-02-13'), true);
  assert.equal(isSecret(t, 'dinara', '2026-02-14'), false);
  assert.equal(isSecret(t, 'dinara', '2026-03-01'), false);
  assert.equal(isSecret({ ...t, revealOn: '' }, 'dinara', '2030-01-01'), true);
  assert.equal(isSecret({ ...t, revealOn: null }, 'dinara', '2030-01-01'), true);
});
test('isPendingSurprise: только для автора до даты', () => {
  const t = { hidden: true, person: 'max', revealOn: '2026-02-14' };
  assert.equal(isPendingSurprise(t, 'max', '2026-02-01'), true);
  assert.equal(isPendingSurprise(t, 'max', '2026-02-14'), false);
  assert.equal(isPendingSurprise(t, 'dinara', '2026-02-01'), false);
});
test('сюрприз влияет на аналитику и экспорт (дата раскрытия в будущем)', () => {
  const t = exp('2026-02-05', 5000, 'Подарки', { hidden: true, revealOn: '2999-02-14' });
  assert.deepEqual(categoryTotals([t], { ym: '2026-02', viewer: 'dinara' }), []);
  const csv = toCsv([t], { viewer: 'dinara' });
  assert.ok(csv.includes('скрыто') && !csv.includes('Подарки'));
  const open = { ...t, revealOn: '2000-01-01' };
  assert.equal(categoryTotals([open], { ym: '2026-02', viewer: 'dinara' }).length, 1);
  assert.ok(toCsv([open], { viewer: 'dinara' }).includes('Подарки'));
});

test('suggestTemplates: ≥3 повторов за 90 дней, шаблоны исключаются', () => {
  const today = '2026-11-04';
  const txs = [exp('2026-11-01', 45000, 'Продукты'), exp('2026-10-20', 45000, 'Продукты'), exp('2026-09-10', 45000, 'Продукты'),
    exp('2026-11-02', 10000, 'Транспорт'), exp('2026-11-03', 10000, 'Транспорт'), exp('2026-01-01', 45000, 'Продукты'), exp('2026-08-01', 45000, 'Продукты')];
  const s = suggestTemplates(txs, today);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].category, s[0].amount, s[0].count, s[0].tpl.category], ['Продукты', 45000, 3, 'Продукты']);
  assert.equal(suggestTemplates(txs, today, [{ id: 'x', title: 'a', tpl: { category: 'Продукты', amount: 45000, method: 'card' } }]).length, 0);
  assert.equal(suggestTemplates(txs, today, [], null, 4).length, 0);
});
test('suggestTemplates: другой способ — другая группа', () => {
  const txs = [exp('2026-11-01', 100, 'Другое'), exp('2026-11-02', 100, 'Другое', { method: 'cash' }), exp('2026-11-03', 100, 'Другое')];
  assert.equal(suggestTemplates(txs, '2026-11-04').length, 0);
});

test('txFromTemplate: подставляет сегодня и того, кто за телефоном', () => {
  const t = txFromTemplate({ type: 'expense', amount: 30000, category: 'Еда вне дома', scope: 'shared', person: 'max', paidFrom: 'max', method: 'card', shareMax: 60, note: 'Кофе' }, '2026-11-04', 'dinara');
  assert.deepEqual([t.date, t.person, t.paidFrom, t.shareMax], ['2026-11-04', 'dinara', 'dinara', 60]);
  assert.deepEqual(templateErrors({ type: 'expense', amount: 100, category: 'Другое', scope: 'personal', person: 'max' }, 'dinara'), []);
  assert.equal(txFromTemplate({ type: 'expense', amount: 100, scope: 'shared', paidFrom: 'joint' }, '2026-11-04', 'max').paidFrom, 'joint');
  assert.ok(templateErrors({ type: 'expense', amount: 0 }, 'max').length > 0);
});
test('templateFromTx оставляет нужные поля', () => {
  const tpl = templateFromTx({ type: 'expense', amount: 5, date: '2026-01-01', id: 'z', revealOn: '2026-03-01', note: '', hidden: false, category: 'Другое' });
  assert.deepEqual(Object.keys(tpl).sort(), ['amount', 'category', 'hidden', 'type']);
});

test('parseQuickLink: полная ссылка', () => {
  const d = parseQuickLink('?add=450&cat=%D0%9F%D1%80%D0%BE%D0%B4%D1%83%D0%BA%D1%82%D1%8B&scope=shared&method=card&note=%D0%9A%D0%BE%D1%84%D0%B5');
  assert.deepEqual(d, { type: 'expense', amount: '450', category: 'Продукты', scope: 'shared', method: 'card', note: 'Кофе' });
});
test('parseQuickLink: суммы, мусор и пустые', () => {
  assert.equal(parseQuickLink('?add=450,5').amount, '450,5');
  assert.equal(parseQuickLink('?add=1%20200.50').amount, '1200,5');
  assert.equal(parseQuickLink('?add=abc').amount, '');
  assert.equal(parseQuickLink('?add=-5').amount, '');
  assert.equal(parseQuickLink('?add').amount, '');
  assert.deepEqual(parseQuickLink('?add=10&scope=weird&method=bitcoin'), { type: 'expense', amount: '10' });
  assert.equal(parseQuickLink('?method=card'), null);
  assert.equal(parseQuickLink(''), null);
  assert.equal(parseQuickLink(undefined), null);
  assert.equal(parseQuickLink('?add=1&method=CASH').method, 'cash');
});
test('parseQuickLink: шаблон и обрезка длины', () => {
  assert.deepEqual(parseQuickLink('?tpl=%D0%9A%D0%BE%D1%84%D0%B5'), { tpl: 'Кофе' });
  assert.deepEqual(parseQuickLink('?tpl=Кофе&add=5'), { tpl: 'Кофе' });
  assert.equal(parseQuickLink('?add=1&note=' + 'я'.repeat(500)).note.length, 120);
  assert.equal(parseQuickLink('?add=1&note=%3Cb%3E').note, '<b>'); // экранирует интерфейс, не парсер
});
test('buildQuickLink и parseQuickLink обратимы', () => {
  const url = buildQuickLink('https://x.test/app/', { amount: '450', cat: 'Продукты', scope: 'shared', method: 'card', note: 'Кофе с молоком' });
  const back = parseQuickLink(url.slice(url.indexOf('?')));
  assert.deepEqual([back.amount, back.category, back.note], ['450', 'Продукты', 'Кофе с молоком']);
  assert.equal(parseQuickLink(buildQuickLink('https://x.test/', { tpl: 'Кофе утром' }).replace('https://x.test/', '')).tpl, 'Кофе утром');
});
test('findTemplate без регистра и ё', () => {
  assert.equal(findTemplate([{ title: 'Ёлка' }], 'елка')?.title, 'Ёлка');
  assert.equal(findTemplate([], 'x'), null);
});

test('даты: daysBetween, addDays, shortDate', () => {
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(shortDate('2026-02-14'), '14 фев');
});

test('upcomingCharges: 30 дней, пауза и уже проведённое', () => {
  const rec = [
    { id: 'a', day: 8, lastRun: '2026-11', active: true, tpl: { type: 'expense', amount: 2500000, note: 'Аренда' } },
    { id: 'b', day: 20, lastRun: '2026-10', active: true, tpl: { type: 'expense', amount: 50000, note: 'Музыка' } },
    { id: 'c', day: 10, lastRun: '2026-10', active: false, tpl: { type: 'expense', amount: 1, note: 'Пауза' } },
    { id: 'd', day: 5, lastRun: '2026-11', active: true, tpl: { type: 'income', amount: 9000000, note: 'Зарплата' } },
  ];
  // a и d уже проведены в ноябре → ближайшие у них в декабре (после окна 30 дней: до 4 дек.)
  const l = upcomingCharges(rec, '2026-11-04', 30);
  assert.deepEqual(l.map((x) => [x.recId, x.date, x.in]), [['b', '2026-11-20', 16]]);
  const l2 = upcomingCharges(rec, '2026-11-04', 40);
  assert.deepEqual(l2.map((x) => x.recId), ['b', 'd', 'a']);
});
test('upcomingCharges: следующий месяц в окне, пропуск через lastRun', () => {
  const rec = [{ id: 'a', day: 2, lastRun: '2026-11', active: true, tpl: { type: 'expense', amount: 100 } }];
  assert.deepEqual(upcomingCharges(rec, '2026-11-20', 30).map((x) => x.date), ['2026-12-02']);
  const skipped = [{ ...rec[0], lastRun: skipLastRun(rec[0], '2026-12-02') }];
  assert.deepEqual(upcomingCharges(skipped, '2026-11-20', 30), []);
  assert.equal(skipLastRun({ lastRun: '2027-01' }, '2026-12-02'), '2027-01');
});
test('upcomingCharges: пропуск текущего месяца', () => {
  const r = { id: 'b', day: 20, lastRun: '2026-10', active: true, tpl: { type: 'expense', amount: 7 } };
  assert.deepEqual(upcomingCharges([r], '2026-11-04').map((x) => x.date), ['2026-11-20']);
  assert.deepEqual(upcomingCharges([{ ...r, lastRun: skipLastRun(r, '2026-11-20') }], '2026-11-04'), []);
});
test('chargesTotals считает расходы и доходы отдельно', () => {
  assert.deepEqual(chargesTotals([{ tpl: { type: 'expense', amount: 5 } }, { tpl: { type: 'income', amount: 9 } }, { tpl: { type: 'transfer', amount: 100 } }]), { out: 5, inc: 9 });
});

test('runway: баланс / средние общие траты', () => {
  const txs = [inc('2026-07-01', 1000000, 'max', { wallet: 'joint' }),
    exp('2026-08-10', 100000, 'Продукты', { paidFrom: 'joint' }), exp('2026-09-10', 100000, 'Продукты', { paidFrom: 'joint' }), exp('2026-10-10', 100000, 'Продукты', { paidFrom: 'joint' })];
  const r = runway(txs, '2026-11');
  assert.equal(r.monthly, 100000);
  assert.equal(r.joint, 700000);
  assert.equal(r.months, 7);
});
test('runway: мало данных или пустой баланс → null', () => {
  assert.equal(runway([], '2026-11'), null);
  assert.equal(runway([exp('2026-10-10', 100, 'x', { paidFrom: 'joint' })], '2026-11'), null);
  assert.equal(runway([exp('2026-10-01', 100, 'x'), exp('2026-10-02', 100, 'x'), exp('2026-10-03', 100, 'x')], '2026-11'), null);
});

test('debtAgeDays: с даты возникновения долга', () => {
  const txs = [exp('2026-10-01', 200000, 'Продукты'), exp('2026-10-10', 200000, 'Продукты')];
  assert.equal(debtAgeDays(txs, '2026-10-22'), 21);
  assert.equal(debtAgeDays([], '2026-10-22'), null);
});
test('debtAgeDays: расчёт обнуляет, смена стороны начинает заново', () => {
  const base = [exp('2026-09-01', 200000, 'Продукты'), { type: 'transfer', date: '2026-09-05', amount: 50000, from: 'dinara', to: 'max', fromMethod: 'card', toMethod: 'card' }];
  assert.equal(debtAgeDays(base, '2026-09-10'), 9);
  assert.equal(debtAgeDays([...base, exp('2026-09-08', 100000, 'x', { paidFrom: 'dinara' })], '2026-09-10'), null);
  assert.equal(debtAgeDays([...base, exp('2026-09-08', 400000, 'x', { paidFrom: 'dinara' })], '2026-09-10'), 2);
});

test('incomeShare: доходы за 3 месяца', () => {
  const txs = [inc('2026-09-05', 7000000, 'max'), inc('2026-10-05', 3000000, 'dinara'), inc('2026-05-05', 99999999, 'dinara')];
  assert.equal(incomeShare(txs, '2026-11-04'), 70);
  assert.equal(incomeShare([], '2026-11-04'), null);
});
