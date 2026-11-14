import test from 'node:test';
import assert from 'node:assert/strict';
import { backupDue, daysSince, BACKUP_EVERY_DAYS, MIN_TXS } from '../lib/backup.js';

const DAY = 86400000, now = Date.UTC(2026, 10, 14);

test('мало операций — не напоминаем', () => {
  assert.equal(backupDue({ txCount: MIN_TXS - 1, now }), false);
});
test('копий не было и операций достаточно — напоминаем', () => {
  assert.equal(backupDue({ txCount: MIN_TXS, now }), true);
});
test('свежая копия — не напоминаем, старая — напоминаем', () => {
  assert.equal(backupDue({ txCount: 100, last: now - 5 * DAY, now }), false);
  assert.equal(backupDue({ txCount: 100, last: now - BACKUP_EVERY_DAYS * DAY, now }), false);
  assert.equal(backupDue({ txCount: 100, last: now - (BACKUP_EVERY_DAYS + 1) * DAY, now }), true);
});
test('«Позже» откладывает напоминание до срока', () => {
  assert.equal(backupDue({ txCount: 100, snoozeUntil: now + DAY, now }), false);
  assert.equal(backupDue({ txCount: 100, snoozeUntil: now - 1, now }), true);
});
test('с синхронизацией не напоминаем', () => {
  assert.equal(backupDue({ txCount: 100, now, synced: true }), false);
});
test('daysSince', () => {
  assert.equal(daysSince(0, now), null);
  assert.equal(daysSince(now - 3 * DAY - 5, now), 3);
});
