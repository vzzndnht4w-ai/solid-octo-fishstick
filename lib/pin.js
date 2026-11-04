// PIN-код: чистая логика без DOM (работает в браузере и в Node). Хранится только соль и SHA-256-хэш.
export const PIN_LENGTH = 4;
export const FREE_ATTEMPTS = 5;        // столько неверных вводов подряд — и пауза
export const BASE_PAUSE_MS = 30_000;   // первая пауза; каждая следующая серия — вдвое длиннее
export const MAX_PAUSE_MS = 300_000;

export const isValidPin = (pin) => typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomSalt = () => toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));

/** SHA-256(соль + ':' + PIN) в виде hex. */
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', data));
}

/** Запись для хранилища: 'соль$хэш'. */
export async function createPinRecord(pin, salt = randomSalt()) {
  if (!isValidPin(pin)) throw new Error('bad pin');
  return `${salt}$${await hashPin(pin, salt)}`;
}

const sameText = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

export async function verifyPin(pin, record) {
  if (!isValidPin(pin) || typeof record !== 'string' || !record.includes('$')) return false;
  const [salt, hash] = record.split('$');
  return sameText(await hashPin(pin, salt), hash);
}

/**
 * Нужно ли блокировать после возвращения из фона.
 * autoLockMin: 0 — не блокировать при возврате (только при запуске).
 */
export function shouldLock({ hiddenAt, now, autoLockMin }) {
  if (!autoLockMin || autoLockMin <= 0 || !hiddenAt) return false;
  return now - hiddenAt >= autoLockMin * 60_000;
}

// ---------- Лимит попыток ----------
export const newThrottle = () => ({ fails: 0, until: 0 });

/** { ok, waitMs } — можно ли сейчас вводить PIN. */
export function canAttempt(t, now) {
  const waitMs = Math.max(0, (t.until || 0) - now);
  return { ok: waitMs === 0, waitMs };
}

/** Состояние после неверного ввода: каждые FREE_ATTEMPTS ошибок подряд — пауза, растущая вдвое. */
export function recordFail(t, now) {
  const fails = (t.fails || 0) + 1;
  let until = t.until || 0;
  if (fails % FREE_ATTEMPTS === 0) {
    const series = fails / FREE_ATTEMPTS;
    until = now + Math.min(BASE_PAUSE_MS * 2 ** (series - 1), MAX_PAUSE_MS);
  }
  return { fails, until };
}

export const recordSuccess = () => newThrottle();

/** Сколько попыток осталось до паузы. */
export const attemptsLeft = (t) => FREE_ATTEMPTS - ((t.fails || 0) % FREE_ATTEMPTS);
