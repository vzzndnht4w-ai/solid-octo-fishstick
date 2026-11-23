// PIN-код: чистая логика без DOM (браузер и Node). Новые записи используют PBKDF2-SHA-256.
export const PIN_LENGTH = 4;
export const FREE_ATTEMPTS = 5;
export const BASE_PAUSE_MS = 30_000;
export const MAX_PAUSE_MS = 300_000;
export const PIN_KDF_ITERATIONS = 310_000;
const MIN_KDF_ITERATIONS = 100_000;
const MAX_KDF_ITERATIONS = 1_000_000;

export const isValidPin = (pin) => typeof pin === 'string' && /^\\d{4}$/.test(pin);
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => {
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('bad hex');
  return Uint8Array.from(hex.match(/../g), (x) => Number.parseInt(x, 16));
};
export const randomSalt = () => toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));

/** Legacy SHA-256 для проверки и миграции старых записей. */
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', data));
}
async function derivePin(pin, salt, iterations) {
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations }, key, 256);
  return toHex(bits);
}

/** Новая запись: pbkdf2$итерации$соль$хэш. */
export async function createPinRecord(pin, salt = randomSalt()) {
  if (!isValidPin(pin)) throw new Error('bad pin');
  return `pbkdf2$${PIN_KDF_ITERATIONS}$${salt}$${await derivePin(pin, salt, PIN_KDF_ITERATIONS)}`;
}

const sameText = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

/** Старые SHA-256-записи остаются валидными до успешного входа и автоматической миграции. */
export async function verifyPin(pin, record) {
  if (!isValidPin(pin) || typeof record !== 'string') return false;
  try {
    const parts = record.split('$');
    if (parts.length === 2) {
      const [salt, hash] = parts;
      return /^[0-9a-f]{32}$/i.test(salt) && /^[0-9a-f]{64}$/i.test(hash) && sameText(await hashPin(pin, salt), hash);
    }
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = Number(parts[1]), [, , salt, hash] = parts;
    if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) return false;
    if (!/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{64}$/i.test(hash)) return false;
    return sameText(await derivePin(pin, salt, iterations), hash);
  } catch { return false; }
}

export const needsPinUpgrade = (record) => typeof record === 'string' && !record.startsWith('pbkdf2$');

export function shouldLock({ hiddenAt, now, autoLockMin }) {
  if (!autoLockMin || autoLockMin <= 0 || !hiddenAt) return false;
  return now - hiddenAt >= autoLockMin * 60_000;
}

export const newThrottle = () => ({ fails: 0, until: 0 });
export function canAttempt(t, now) {
  const waitMs = Math.max(0, (t.until || 0) - now);
  return { ok: waitMs === 0, waitMs };
}
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
export const attemptsLeft = (t) => FREE_ATTEMPTS - ((t.fails || 0) % FREE_ATTEMPTS);
