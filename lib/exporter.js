// Экспорт и резервные копии: чистая логика без DOM.
import { WALLETS, method } from '../ledger.js';
import { isSecret } from './tools.js';

const MASK = 'скрыто';
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+@\t\r]/.test(s) || /^-(?![\d.,]+$)/.test(s)) s = "'" + s; // защита от формул в Excel
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rub = (kop) => `${kop < 0 ? '-' : ''}${Math.floor(Math.abs(kop) / 100)},${String(Math.abs(kop) % 100).padStart(2, '0')}`;

export const CSV_HEAD = ['Дата', 'Тип', 'Категория', 'Сумма', 'Кто', 'Общее/личное', 'Откуда', 'Способ', 'Заметка'];

/** CSV (разделитель «;», BOM для Excel). ym — только этот месяц. Чужие скрытые детали маскируются. */
export function toCsv(txs, { viewer, ym = null, names = { max: 'Максим', dinara: 'Динара' }, wallets = WALLETS } = {}) {
  const mname = (m) => (m === 'cash' ? 'наличные' : 'карта');
  const wname = (w) => (w === 'joint' ? 'Общий котёл' : names[w] || wallets[w] || w);
  const list = txs.filter((t) => !ym || t.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const rows = list.map((t) => {
    const secret = isSecret(t, viewer);
    const date = `${t.date.slice(8, 10)}.${t.date.slice(5, 7)}.${t.date.slice(0, 4)}`;
    if (t.type === 'transfer') {
      const same = t.from === t.to;
      return [date, 'Перевод', same ? 'Снятие/внесение' : '', rub(t.amount), '', '', `${wname(t.from)} → ${wname(t.to)}`, `${mname(method(t, 'from'))} → ${mname(method(t, 'to'))}`, secret ? '' : t.note || ''];
    }
    const type = t.type === 'income' ? 'Доход' : 'Расход';
    const sc = t.type === 'income' ? '' : t.scope === 'personal' ? 'личное' : 'общее';
    const from = t.type === 'income' ? wname(t.wallet) : wname(t.paidFrom);
    return [date, type, secret ? MASK : t.category, rub(t.type === 'income' ? t.amount : -t.amount), names[t.person] || t.person, sc, from, mname(method(t)), secret ? '' : t.note || ''];
  });
  return '﻿' + [CSV_HEAD, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/** Сводка: количество операций и период. */
export function dataSummary(txs) {
  if (!txs.length) return { count: 0, from: null, to: null };
  const ds = txs.map((t) => t.date).sort();
  return { count: txs.length, from: ds[0], to: ds[ds.length - 1] };
}

/** Проверка и разбор резервной копии. Бросает Error с понятным сообщением. */
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(String(text).trim()); } catch { throw new Error('Это не похоже на резервную копию: текст не читается как JSON.'); }
  if (!d || typeof d !== 'object' || !Array.isArray(d.txs)) throw new Error('В копии нет списка операций — похоже, это не файл приложения «Мы».');
  const bad = d.txs.filter((t) => !t || typeof t !== 'object' || !['income', 'expense', 'transfer'].includes(t.type) || !Number.isInteger(t.amount) || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(t.date));
  if (bad.length) throw new Error(`В копии есть повреждённые операции: ${bad.length}. Восстановление остановлено, ваши данные не тронуты.`);
  return d;
}

export const backupFilename = (today) => `my-money-backup-${today}.json`;
export const csvFilename = (today, ym) => `my-money-${ym || 'all'}-${today}.csv`;
