// Общие помощники интерфейса «быстрых инструментов»: иконки, добавление из шаблона, копирование.
import { registerIcons } from '../icons.js';
import { validate } from '../ledger.js';
import { txFromTemplate } from './tools.js';
import { money as fm } from '../core.js';

registerIcons({
  qbolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  qcopy: 'M9 9h11v11H9zM5 15V4h11',
  qcal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  qskip: 'M5 5l9 7-9 7zM18 5v14',
  qphone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  qrun: 'M3 17l6-6 4 4 8-8M15 7h6v6',
});

/** Добавляет операцию из шаблона на сегодня; тост «Добавлено — Отменить». Возвращает true при успехе. */
export function quickAdd(item, a) {
  const s = a.store.get(), tx = txFromTemplate(item.tpl, a.today(), s.viewer);
  const errs = validate(tx);
  if (errs.length) { a.toast(`Шаблон «${item.title}»: ${errs[0]}`); return false; }
  const id = crypto.randomUUID();
  a.store.add({ id, ...tx });
  const sign = tx.type === 'income' ? '+' : '−';
  a.toast(`Добавлено: ${item.title} ${sign}${fm(tx.amount)}`, { label: 'Отменить', fn: () => a.store.remove(id) });
  return true;
}

/** Копирует текст в буфер; возвращает true/false. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* запасной путь ниже */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

/** Черновик для формы добавления из шаблона (startWith): сумма строкой в рублях. */
export function draftFromTemplate(item, viewer) {
  const t = txFromTemplate(item.tpl, '', viewer);
  delete t.date;
  return { ...t, amount: String(t.amount / 100).replace('.', ',') };
}
