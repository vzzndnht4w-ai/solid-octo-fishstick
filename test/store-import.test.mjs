import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k, v) { this.data.set(k, String(v)); } };
const { defaults, store, validateBackup } = await import('../store.js');

test('валидная резервная копия проходит проверку', () => {
  const d = defaults();
  d.txs.push({ id: 'tx-1', type: 'expense', amount: 1200, createdAt: 1 });
  assert.equal(validateBackup(d), d);
});

test('импорт отклоняет отсутствующие операции и неверную структуру', () => {
  for (const bad of [null, [], {}, { txs: {} }, { txs: [], settings: [] }, { txs: [], goals: {} }]) {
    assert.throws(() => validateBackup(bad));
  }
});

test('импорт отклоняет операции без ID, с неизвестным типом или дробной суммой', () => {
  const base = { txs: [] };
  for (const tx of [
    { type: 'expense', amount: 100 },
    { id: 'x', type: 'unknown', amount: 100 },
    { id: 'x', type: 'expense', amount: 1.5 },
    { id: 'x', type: 'income', amount: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.throws(() => validateBackup({ ...base, txs: [tx] }));
});

test('импорт отклоняет небезопасные ключи и чрезмерную глубину', () => {
  const polluted = JSON.parse('{"txs":[],"settings":{"__proto__":{"polluted":true}}}');
  assert.throws(() => validateBackup(polluted), /небезопасное поле/);
  let deep = {}, cursor = deep;
  for (let i = 0; i < 82; i++) { cursor.child = {}; cursor = cursor.child; }
  assert.throws(() => validateBackup({ txs: [], extra: deep }), /глубокая/);
});

test('невалидный импорт не заменяет текущее состояние', () => {
  const before = JSON.stringify(store.get());
  assert.throws(() => store.importJson('{"txs":[]} trailing'));
  assert.equal(JSON.stringify(store.get()), before);
  assert.throws(() => store.importJson(JSON.stringify({ txs: [{ id: 'x', type: 'expense', amount: 2.4 }] })));
  assert.equal(JSON.stringify(store.get()), before);
});

test('валидный импорт мигрирует старую копию и сбрасывает PIN из экспорта', () => {
  const backup = { txs: [{ id: 'old-1', type: 'income', amount: 500, createdAt: 1 }], settings: { pins: { max: 'legacy-hash' } } };
  store.importJson(JSON.stringify(backup));
  assert.equal(store.get().txs.length, 1);
  assert.deepEqual(store.get().settings.pins, {});
  store.importJson(JSON.stringify({ txs: [] }));
});
