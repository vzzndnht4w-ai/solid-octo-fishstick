import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptQr, receiptDraft, hasReceipt } from '../lib/receipt.js';

test('кассовый чек ФНС: сумма, дата, время и номер', () => {
  const p = parseReceiptQr('t=20231115T1420&s=1250.50&fn=9960440300000000&i=12345&fp=1234567890&n=1');
  assert.equal(p.kind, 'receipt');
  assert.equal(p.amount, 125050);
  assert.equal(p.date, '2023-11-15');
  assert.equal(p.time, '14:20');
  assert.equal(p.id, '9960440300000000-12345-1234567890');
  assert.equal(p.refund, false);
});

test('чек: секунды в времени, дробные копейки, возврат', () => {
  const p = parseReceiptQr('t=20240229T142005&s=99.9&fn=1&i=2&fp=3&n=2');
  assert.equal(p.amount, 9990);
  assert.equal(p.date, '2024-02-29');
  assert.equal(p.refund, true);
  assert.equal(receiptDraft(p, '2026-01-01').type, 'income');
});

test('чек: мусор и неполные данные отклоняются', () => {
  assert.equal(parseReceiptQr(''), null);
  assert.equal(parseReceiptQr('https://example.com'), null);
  assert.equal(parseReceiptQr('t=20231115T1420&s=0&fn=1&i=2&fp=3'), null);          // нулевая сумма
  assert.equal(parseReceiptQr('t=20231315T1420&s=10&fn=1&i=2&fp=3'), null);          // месяц 13
  assert.equal(parseReceiptQr('t=20231115T1420&s=10&fn=1&i=2'), null);                // нет fp
  assert.equal(parseReceiptQr('t=20231115T1420&s=1e3&fn=1&i=2&fp=3'), null);          // экспонента
});

test('платёжный QR (ST00012): получатель и сумма в копейках', () => {
  const p = parseReceiptQr('ST00012|Name=ООО Ромашка|PersonalAcc=40702810|Sum=123456|Purpose=Оплата заказа');
  assert.equal(p.kind, 'payment');
  assert.equal(p.amount, 123456);
  assert.equal(p.note, 'ООО Ромашка');
  assert.equal(p.id, null);
  assert.equal(parseReceiptQr('ST00012|Name=X|Sum=abc'), null);
  assert.equal(parseReceiptQr('ST00012|Name=X'), null);
});

test('заготовка формы и защита от дубля', () => {
  const p = parseReceiptQr('t=20231115T1420&s=1250.50&fn=1&i=2&fp=3&n=1');
  const d = receiptDraft(p, '2026-01-01');
  assert.deepEqual(d, { type: 'expense', amount: '1250,5', date: '2023-11-15', note: 'Чек', receipt: '1-2-3' });
  assert.equal(hasReceipt([{ receipt: '1-2-3' }], '1-2-3'), true);
  assert.equal(hasReceipt([{ receipt: '9-9-9' }], '1-2-3'), false);
  assert.equal(hasReceipt([], null), false);
  const pay = receiptDraft(parseReceiptQr('ST00012|Name=Кафе|Sum=50000'), '2026-02-02');
  assert.equal(pay.date, '2026-02-02');
  assert.ok(!('receipt' in pay));
});
