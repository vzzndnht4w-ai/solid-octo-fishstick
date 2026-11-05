import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCENTS, DEFAULT_COLORS, normalizeColor, migrateColors, accentOf, contrast, onColor } from '../lib/appearance.js';

test('каждый цвет профиля даёт читаемый текст (≥4.5:1) на основной заливке в обеих темах', () => {
  for (const [k, c] of Object.entries(ACCENTS)) {
    for (const mode of ['light', 'dark']) {
      const fill = c[mode][0], text = onColor(fill);
      assert.ok(contrast(fill, text) >= 4.5, `${k}/${mode}: ${fill} на ${text} = ${contrast(fill, text).toFixed(2)}`);
    }
  }
});

test('цвета профилей по умолчанию — из нового набора и различаются', () => {
  assert.equal(DEFAULT_COLORS.max, 'emerald');
  assert.equal(DEFAULT_COLORS.dinara, 'mist');
  assert.equal(Object.keys(ACCENTS).length, 6);
});

test('старые имена цветов переходят в новые', () => {
  const map = { blue: 'emerald', rose: 'mist', violet: 'mist', green: 'emerald', orange: 'gold', teal: 'teal', clay: 'clay' };
  for (const [old, now] of Object.entries(map)) assert.equal(normalizeColor(old), now);
  assert.equal(normalizeColor('что-то'), '');
  assert.equal(accentOf('blue'), ACCENTS.emerald);
  assert.equal(accentOf(undefined), ACCENTS.emerald);
});

test('migrateColors: blue/rose → emerald/mist, остальные поля профиля сохраняются', () => {
  const out = migrateColors({ max: { name: 'Макс', female: false, color: 'blue' }, dinara: { name: 'Дина', female: true, color: 'rose' } });
  assert.deepEqual(out.max, { name: 'Макс', female: false, color: 'emerald' });
  assert.deepEqual(out.dinara, { name: 'Дина', female: true, color: 'mist' });
});

test('migrateColors: совпавшие после перехода цвета разводятся, неизвестные заменяются по умолчанию', () => {
  const same = migrateColors({ max: { color: 'blue' }, dinara: { color: 'green' } });
  assert.notEqual(same.max.color, same.dinara.color);
  assert.ok(ACCENTS[same.dinara.color]);
  const junk = migrateColors({ max: { color: 'x' }, dinara: {} });
  assert.deepEqual([junk.max.color, junk.dinara.color], ['emerald', 'mist']);
});
