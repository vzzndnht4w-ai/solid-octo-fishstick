import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, createPinRecord, verifyPin, isValidPin, shouldLock, newThrottle, canAttempt, recordFail, recordSuccess, attemptsLeft, randomSalt, FREE_ATTEMPTS, BASE_PAUSE_MS, MAX_PAUSE_MS, PIN_KDF_ITERATIONS, needsPinUpgrade } from '../lib/pin.js';
import { applyProfiles, PEOPLE, WALLETS } from '../ledger.js';

test('PBKDF2-запись: соль случайная, PIN проверяется корректно', async () => {
  const a = await createPinRecord('1234'), b = await createPinRecord('1234');
  assert.notEqual(a, b);
  assert.match(a, /^pbkdf2\\$\\d+\\$[0-9a-f]{32}\\$[0-9a-f]{64}$/);
  assert.equal(a.split('$')[1], String(PIN_KDF_ITERATIONS));
  assert.equal(await verifyPin('1234', a), true);
  assert.equal(await verifyPin('1235', a), false);
  assert.equal(await verifyPin('abcd', a), false);
  assert.equal(await verifyPin('1234', undefined), false);
  assert.equal(needsPinUpgrade(a), false);
});

test('старые SHA-256 записи продолжают работать и требуют обновления', async () => {
  const legacy = `a1b2c3d4e5f60718a1b2c3d4e5f60718$${await hashPin('4821', 'a1b2c3d4e5f60718')}`;
  assert.equal(await verifyPin('4821', legacy), true);
  assert.equal(await verifyPin('4822', legacy), false);
  assert.equal(needsPinUpgrade(legacy), true);
  assert.equal(await verifyPin('4821', 'мусор'), false);
});

test('PBKDF2 отвергает некорректные и чрезмерные параметры', async () => {
  assert.equal(await verifyPin('1234', 'pbkdf2$1$' + 'a'.repeat(32) + '$' + 'b'.repeat(64)), false);
  assert.equal(await verifyPin('1234', 'pbkdf2$999999999$' + 'a'.repeat(32) + '$' + 'b'.repeat(64)), false);
  assert.equal(await verifyPin('1234', 'pbkdf2$310000$bad$bad'), false);
});

test('isValidPin: ровно 4 цифры', async () => {
  assert.ok(isValidPin('0123'));
  for (const bad of ['123', '12345', 'abcd', '12 4', '', null, 1234]) assert.equal(isValidPin(bad), false);
  await assert.rejects(() => createPinRecord('12'));
});

test('shouldLock: порог в минутах, 0 — не блокировать', () => {
  const t0 = 1_000_000;
  assert.equal(shouldLock({ hiddenAt: t0, now: t0 + 59_000, autoLockMin: 1 }), false);
  assert.equal(shouldLock({ hiddenAt: t0, now: t0 + 60_000, autoLockMin: 1 }), true);
  assert.equal(shouldLock({ hiddenAt: t0, now: t0 + 4 * 60_000, autoLockMin: 5 }), false);
  assert.equal(shouldLock({ hiddenAt: t0, now: t0 + 99 * 60_000, autoLockMin: 0 }), false);
  assert.equal(shouldLock({ hiddenAt: 0, now: t0, autoLockMin: 1 }), false);
});

test('лимит попыток: пауза после серии ошибок, растёт и ограничена', () => {
  let t = newThrottle(), now = 5000;
  for (let i = 1; i < FREE_ATTEMPTS; i++) { t = recordFail(t, now); assert.equal(canAttempt(t, now).ok, true); }
  assert.equal(attemptsLeft(t), 1);
  t = recordFail(t, now);
  assert.deepEqual(canAttempt(t, now), { ok: false, waitMs: BASE_PAUSE_MS });
  assert.equal(canAttempt(t, now + BASE_PAUSE_MS).ok, true);
  now += BASE_PAUSE_MS;
  for (let i = 0; i < FREE_ATTEMPTS; i++) t = recordFail(t, now);
  assert.equal(canAttempt(t, now).waitMs, BASE_PAUSE_MS * 2);
  for (let i = 0; i < FREE_ATTEMPTS * 10; i++) t = recordFail(t, now);
  assert.ok(canAttempt(t, now).waitMs <= MAX_PAUSE_MS);
  assert.deepEqual(recordSuccess(), newThrottle());
});

test('applyProfiles обновляет имена людей и кошельков', () => {
  const before = { ...PEOPLE };
  applyProfiles({ max: { name: ' Артём ' }, dinara: { name: 'Лена' } });
  assert.equal(PEOPLE.max, 'Артём');
  assert.equal(WALLETS.max, 'Кошелёк · Артём');
  assert.equal(WALLETS.dinara, 'Кошелёк · Лена');
  assert.equal(WALLETS.joint, 'Общий баланс');
  applyProfiles({ max: { name: '' }, dinara: {} });
  assert.equal(PEOPLE.max, 'Артём');
  applyProfiles({ max: { name: before.max }, dinara: { name: before.dinara } });
});
