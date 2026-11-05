import test from 'node:test';
import assert from 'node:assert/strict';
import { balancesByMethod, spendByMethod, balances, debt, stats, splitAmount, validate, shareByIncome, parseMoney, formatMoney } from '../ledger.js';

const d = '2026-11-04';
const exp = (o) => ({ type: 'expense', date: d, ...o });
const inc = (o) => ({ type: 'income', date: d, ...o });
const tr = (o) => ({ type: 'transfer', date: d, ...o });

test('личная трата (машина) не трогает общий баланс и долги', () => {
  const txs = [
    inc({ amount: 100000_00, person: 'max', wallet: 'max' }),
    tr({ amount: 20000_00, from: 'max', to: 'joint' }),
    exp({ amount: 5000_00, scope: 'personal', person: 'max', paidFrom: 'max' }),
  ];
  assert.deepEqual(balances(txs), { max: 75000_00, dinara: 0, joint: 20000_00 });
  assert.equal(debt(txs), 0);
});

test('продукты 50/50 с карты Максима: баланс цел, Динара должна половину', () => {
  const txs = [
    tr({ amount: 10000_00, from: 'max', to: 'joint' }),
    exp({ amount: 3000_00, scope: 'shared', person: 'max', paidFrom: 'max', shareMax: 50 }),
  ];
  assert.equal(balances(txs).joint, 10000_00);
  assert.equal(debt(txs), 1500_00);
});

test('общая трата с карты Динары в пропорции 60/40: Максим должен 60%', () => {
  const txs = [exp({ amount: 1000_00, scope: 'shared', person: 'dinara', paidFrom: 'dinara', shareMax: 60 })];
  assert.equal(debt(txs), -600_00);
});

test('аренда из общего баланса: уменьшает баланс, долгов нет', () => {
  const txs = [
    tr({ amount: 50000_00, from: 'dinara', to: 'joint' }),
    exp({ amount: 40000_00, scope: 'shared', person: 'max', paidFrom: 'joint', shareMax: 50 }),
  ];
  assert.equal(balances(txs).joint, 10000_00);
  assert.equal(debt(txs), 0);
});

test('перевод между личными кошельками гасит долг', () => {
  const txs = [
    exp({ amount: 3000_00, scope: 'shared', person: 'max', paidFrom: 'max', shareMax: 50 }),
    tr({ amount: 1500_00, from: 'dinara', to: 'max' }),
  ];
  assert.equal(debt(txs), 0);
});

test('нечётные копейки не теряются', () => {
  const s = splitAmount(10001, 50);
  assert.equal(s.max + s.dinara, 10001);
});

test('статистика по людям', () => {
  const txs = [
    inc({ amount: 100_00, person: 'max', wallet: 'max' }),
    inc({ amount: 50_00, person: 'dinara', wallet: 'dinara' }),
    exp({ amount: 30_00, scope: 'personal', person: 'dinara', paidFrom: 'dinara' }),
    exp({ amount: 20_00, scope: 'shared', person: 'max', paidFrom: 'max', shareMax: 50 }),
    tr({ amount: 10_00, from: 'max', to: 'joint' }),
  ];
  const s = stats(txs);
  assert.equal(s.max.earned, 100_00);
  assert.equal(s.dinara.personal, 30_00);
  assert.equal(s.max.sharedShare, 10_00);
  assert.equal(s.dinara.sharedShare, 10_00);
  assert.equal(s.max.toJoint, 10_00);
});

test('доля по доходам', () => {
  assert.equal(shareByIncome([]), 50);
  assert.equal(shareByIncome([
    inc({ amount: 60_00, person: 'max', wallet: 'max' }),
    inc({ amount: 40_00, person: 'dinara', wallet: 'dinara' }),
  ]), 60);
});

test('валидация', () => {
  assert.ok(validate({ type: 'expense', amount: 0 }).length > 0);
  assert.ok(validate(exp({ amount: 1, scope: 'personal', person: 'max', paidFrom: 'dinara' })).length > 0);
  assert.equal(validate(exp({ amount: 1, scope: 'shared', person: 'max', paidFrom: 'joint', shareMax: 50, method: 'card' })).length, 0);
  assert.ok(validate(tr({ amount: 1, from: 'max', to: 'max' })).length > 0);
});

test('ввод и формат денег', () => {
  assert.equal(parseMoney('1 234,5'), 123450);
  assert.equal(parseMoney('abc'), null);
  assert.equal(formatMoney(123450), '1 234,50 ₽');
});

test('карта и наличные: снятие со счёта, траты наличными', () => {
  const txs = [
    inc({ amount: 100_00, person: 'max', wallet: 'max', method: 'card' }),
    tr({ amount: 30_00, from: 'max', to: 'max', fromMethod: 'card', toMethod: 'cash' }),
    exp({ amount: 10_00, scope: 'personal', person: 'max', paidFrom: 'max', method: 'cash' }),
    exp({ amount: 20_00, scope: 'personal', person: 'max', paidFrom: 'max', method: 'card' }),
  ];
  assert.deepEqual(balancesByMethod(txs).max, { card: 50_00, cash: 20_00 });
  assert.equal(balances(txs).max, 70_00);
  assert.deepEqual(spendByMethod(txs), { card: 20_00, cash: 10_00 });
  assert.equal(debt(txs), 0);
});

test('старые записи без способа считаются картой', () => {
  const txs = [inc({ amount: 5_00, person: 'max', wallet: 'max' })];
  assert.equal(balancesByMethod(txs).max.card, 5_00);
});

test('валидация: перевод между своей картой и наличными допустим', () => {
  assert.equal(validate(tr({ amount: 1, from: 'max', to: 'max', fromMethod: 'card', toMethod: 'cash' })).length, 0);
  assert.ok(validate(tr({ amount: 1, from: 'max', to: 'max', fromMethod: 'card', toMethod: 'card' })).length > 0);
  assert.ok(validate(inc({ amount: 1, person: 'max', wallet: 'max', method: 'x' })).length > 0);
});

import { reservedInGoals, freeJoint } from '../ledger.js';
test('цель: резерв из общего баланса не меняет баланс, а уменьшает свободное', () => {
  const txs = [
    tr({ amount: 50000_00, from: 'max', to: 'joint' }),
    tr({ amount: 10000_00, from: 'joint', to: 'joint', fromMethod: 'card', toMethod: 'card', goalId: 'g1' }),
  ];
  assert.equal(balances(txs).joint, 50000_00);
  assert.equal(reservedInGoals(txs), 10000_00);
  assert.equal(freeJoint(txs), 40000_00);
  assert.equal(validate(txs[1]).length, 0);
});
test('цель: вернуть резерв — отрицательная сумма; взнос с кошелька добавляет деньги и резерв поровну', () => {
  const txs = [
    tr({ amount: 10000_00, from: 'joint', to: 'joint', fromMethod: 'card', toMethod: 'card', goalId: 'g1' }),
    tr({ amount: -4000_00, from: 'joint', to: 'joint', fromMethod: 'card', toMethod: 'card', goalId: 'g1' }),
    tr({ amount: 5000_00, from: 'max', to: 'joint', goalId: 'g1' }),
  ];
  assert.equal(reservedInGoals(txs), 11000_00);
  assert.equal(balances(txs).joint, 5000_00);
  assert.equal(freeJoint(txs), 5000_00 - 11000_00);
  assert.equal(validate(txs[1]).length, 0);
  assert.ok(validate(tr({ amount: 0, from: 'joint', to: 'joint', goalId: 'g1' })).length > 0);
  assert.ok(validate(tr({ amount: -5, from: 'max', to: 'joint', goalId: 'g1' })).length > 0);
});

import { savingFlow } from '../ledger.js';
test('накопления: откладывание с кошелька уменьшает кошелёк, возврат увеличивает', () => {
  const sv = (o) => ({ type: 'saving', date: d, person: 'max', savingId: 's1', method: 'card', ...o });
  const txs = [
    inc({ amount: 100_00, person: 'max', wallet: 'max' }),
    sv({ amount: 30_00, wallet: 'max' }),
    sv({ amount: -10_00, wallet: 'max' }),
    tr({ amount: 20_00, from: 'max', to: 'joint' }),
    sv({ amount: 5_00, wallet: 'joint' }),
  ];
  assert.equal(balances(txs).max, 60_00);
  assert.equal(balances(txs).joint, 15_00);
  assert.equal(savingFlow(txs, 's1'), 25_00);
  assert.equal(debt(txs), 0);
  assert.equal(validate(txs[1]).length, 0);
  assert.ok(validate(sv({ amount: 0, wallet: 'max' })).length > 0);
  assert.ok(validate(sv({ amount: 5, wallet: 'nobody' })).length > 0);
  assert.ok(validate({ type: 'saving', amount: 5, wallet: 'max', method: 'card', person: 'max' }).length > 0);
});
