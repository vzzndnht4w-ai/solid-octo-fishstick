import test from 'node:test';
import assert from 'node:assert/strict';
test('экспорт не содержит PIN-хэшей', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const { store } = await import('../store.js');
  store.mutate((s) => { s.settings.pins = { max: 'salt$hash' }; });
  assert.ok(!store.exportJson().includes('salt$hash'));
});
test('повреждённая копия не ломает схему', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const { store } = await import('../store.js');
  store.importJson(JSON.stringify({ txs: [], goals: null, recurring: null, budgets: null, settings: { pins: null }, categories: null }));
  const s = store.get();
  assert.ok(Array.isArray(s.goals) && Array.isArray(s.recurring) && typeof s.budgets === 'object' && typeof s.settings.pins === 'object');
});
