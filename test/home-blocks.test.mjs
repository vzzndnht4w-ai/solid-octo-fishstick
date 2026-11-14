import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_BLOCKS, hiddenBlocks, setBlock } from '../lib/home-blocks.js';

test('по умолчанию ничего не скрыто', () => {
  assert.deepEqual(hiddenBlocks({}, 'max'), []);
  assert.deepEqual(hiddenBlocks(undefined, 'max'), []);
  assert.deepEqual(hiddenBlocks({ homeHidden: 'x' }, 'max'), []);
});
test('скрыть и вернуть блок, у каждого свой набор', () => {
  const st = {};
  setBlock(st, 'max', 'fairness', false);
  setBlock(st, 'max', 'fairness', false);
  setBlock(st, 'dinara', 'chart', false);
  assert.deepEqual(hiddenBlocks(st, 'max'), ['fairness']);
  assert.deepEqual(hiddenBlocks(st, 'dinara'), ['chart']);
  setBlock(st, 'max', 'fairness', true);
  assert.deepEqual(hiddenBlocks(st, 'max'), []);
  assert.deepEqual(hiddenBlocks(st, 'dinara'), ['chart']);
});
test('неизвестные блоки и люди игнорируются', () => {
  const st = { homeHidden: { max: ['nope', 'chart', 'chart'] } };
  assert.deepEqual(hiddenBlocks(st, 'max'), ['chart']);
  setBlock(st, 'max', 'nope', false);
  setBlock(st, 'joint', 'chart', false);
  assert.deepEqual(hiddenBlocks(st, 'max'), ['chart']);
  assert.equal(st.homeHidden.joint, undefined);
});
test('id блоков уникальны', () => {
  assert.equal(new Set(HOME_BLOCKS.map((b) => b[0])).size, HOME_BLOCKS.length);
});
