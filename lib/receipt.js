// Разбор QR-кодов: кассовый чек ФНС и платёжный QR (ГОСТ Р 56042, формат ST0001x).
// В QR чека есть только дата, время, сумма и номера ФН/ФД/ФП: названий товаров и магазина там нет.
import { parseMoney } from '../ledger.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** '20231115T1420' | '20231115T142005' | '2023-11-15T14:20' → { date: '2023-11-15', time: '14:20' } или null. */
function parseStamp(t) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):?(\d{2})/.exec(String(t || ''));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** Кассовый чек: t=20231115T1420&s=1250.50&fn=…&i=…&fp=…&n=1 (n=2 — возврат). */
function parseFiscal(text) {
  const q = Object.fromEntries(text.split('&').map((p) => { const i = p.indexOf('='); return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)]; }));
  const stamp = parseStamp(q.t), amount = parseMoney(q.s);
  if (!stamp || !amount || !q.fn || !q.i || !q.fp) return null;
  const refund = q.n === '2' || q.n === '4';
  return { kind: 'receipt', amount, date: stamp.date, time: stamp.time, id: `${q.fn}-${q.i}-${q.fp}`, refund, note: 'Чек' };
}

/** Платёжный QR: ST00012|Name=ООО «Магазин»|Sum=123456|Purpose=… (Sum в копейках). */
function parsePayment(text) {
  const sep = text[7];
  if (!sep) return null;
  const f = Object.fromEntries(text.slice(8).split(sep).map((p) => { const i = p.indexOf('='); return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)]; }));
  const amount = /^\d{1,13}$/.test(f.Sum || '') ? Number(f.Sum) : 0;
  if (!amount) return null;
  const name = String(f.Name || '').trim().slice(0, 60), purpose = String(f.Purpose || '').trim().slice(0, 60);
  return { kind: 'payment', amount, date: null, time: null, id: null, refund: false, note: name || purpose || 'Платёж по QR' };
}

/** Возвращает { kind, amount (копейки), date, time, id, refund, note } или null, если это не чек и не платёжный QR. */
export function parseReceiptQr(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/^ST0001[123]/.test(s)) return parsePayment(s);
  if (/(^|&)t=/.test(s) && /(^|&)fn=/.test(s)) return parseFiscal(s);
  return null;
}

/** Заготовка формы «Новая операция» по разобранному QR. */
export function receiptDraft(parsed, today) {
  return {
    type: parsed.refund ? 'income' : 'expense',
    amount: String(parsed.amount / 100).replace('.', ','),
    date: parsed.date || today,
    note: parsed.note,
    ...(parsed.id ? { receipt: parsed.id } : {}),
  };
}

/** Чек с таким номером уже добавлен? */
export const hasReceipt = (txs, id) => !!id && txs.some((t) => t.receipt === id);
