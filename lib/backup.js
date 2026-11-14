// Напоминание о резервной копии. Отметки хранятся на этом телефоне отдельно от данных (не синхронизируются):
// у каждого телефона своя история копий.
const KEY = 'we-money-backup';
const DAY = 86400000;
export const BACKUP_EVERY_DAYS = 30, SNOOZE_DAYS = 7, MIN_TXS = 20;

/**
 * Пора ли напомнить о копии. Чистая функция.
 * С включённой синхронизацией данные уже лежат на втором телефоне и на сервере: не напоминаем.
 */
export function backupDue({ txCount = 0, last = 0, snoozeUntil = 0, now = Date.now(), synced = false } = {}) {
  if (synced || txCount < MIN_TXS) return false;
  if (now < snoozeUntil) return false;
  return !last || now - last > BACKUP_EVERY_DAYS * DAY;
}

/** Сколько полных дней прошло с последней копии; null, если копий не было. */
export const daysSince = (last, now = Date.now()) => (last ? Math.floor((now - last) / DAY) : null);

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
export const backupMarks = () => { const d = read(); return { last: +d.last || 0, snoozeUntil: +d.snoozeUntil || 0 }; };
export const markBackup = (now = Date.now()) => write({ last: now, snoozeUntil: 0 });
export const snoozeBackup = (now = Date.now()) => write({ ...read(), snoozeUntil: now + SNOOZE_DAYS * DAY });
