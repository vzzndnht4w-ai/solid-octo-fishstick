// Ядро учёта «Мы». Без зависимостей от браузера — работает и в Node (тесты).
// Деньги хранятся в копейках (целые числа).

export const PEOPLE = { max: 'Максим', dinara: 'Динара' };
export const WALLETS = { max: 'Кошелёк · Максим', dinara: 'Кошелёк · Динара', joint: 'Общий котёл' };

/** Подставляет имена из профилей в PEOPLE и WALLETS (объекты мутируются на месте, ссылки остаются прежними). */
export function applyProfiles(profiles) {
  for (const p of ['max', 'dinara']) {
    const name = String(profiles?.[p]?.name ?? '').trim();
    if (!name) continue;
    PEOPLE[p] = name;
    WALLETS[p] = `Кошелёк · ${name}`;
  }
}

export const EXPENSE_CATEGORIES = ['Продукты', 'Еда вне дома', 'Транспорт', 'Машина', 'Жильё', 'Здоровье', 'Развлечения', 'Одежда', 'Подарки', 'Путешествия', 'Другое'];
export const INCOME_CATEGORIES = ['Зарплата', 'Подработка', 'Подарок', 'Другое'];

export const other = (p) => (p === 'max' ? 'dinara' : 'max');

/** Разбивка суммы по долям: shareMax — процент Максима (0..100). */
export function splitAmount(amount, shareMax) {
  const maxPart = Math.round((amount * shareMax) / 100);
  return { max: maxPart, dinara: amount - maxPart };
}

/**
 * Транзакция:
 *  income:   { type, amount, person, wallet }                         — person заработал, деньги пришли в wallet
 *  expense:  { type, amount, scope:'personal'|'shared', person, paidFrom, shareMax? }
 *            personal — только person, платит из своего кошелька;
 *            shared   — делится по shareMax (% Максима), платит paidFrom (свой кошелёк любого из вас или joint)
 *  transfer: { type, amount, from, to }                               — между кошельками
 * Перевод между личными кошельками Максима и Динары считается взаиморасчётом (гасит долг).
 */
export function validate(tx) {
  const errors = [];
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) errors.push('Сумма должна быть больше нуля');
  const isW = (w) => w in WALLETS;
  const isP = (p) => p in PEOPLE;
  const isM = (m) => m === 'card' || m === 'cash';
  if (tx.type === 'income') {
    if (!isP(tx.person)) errors.push('Не указано, кто заработал');
    if (!isW(tx.wallet)) errors.push('Не указан кошелёк');
    if (!isM(tx.method)) errors.push('Не указан способ: карта или наличные');
  } else if (tx.type === 'expense') {
    if (!isP(tx.person)) errors.push('Не указано, кто потратил');
    if (tx.scope !== 'personal' && tx.scope !== 'shared') errors.push('Не указан тип траты');
    if (tx.scope === 'personal' && tx.paidFrom !== tx.person) errors.push('Личная трата платится из своего кошелька');
    if (tx.scope === 'shared') {
      if (!isW(tx.paidFrom)) errors.push('Не указан кошелёк');
      if (!(tx.shareMax >= 0 && tx.shareMax <= 100)) errors.push('Доля должна быть от 0 до 100');
    }
    if (!isM(tx.method)) errors.push('Не указан способ: карта или наличные');
  } else if (tx.type === 'transfer') {
    if (!isW(tx.from) || !isW(tx.to)) errors.push('Не указаны кошельки');
    else if (!isM(method(tx, 'from')) || !isM(method(tx, 'to'))) errors.push('Не указан способ: карта или наличные');
    else if (tx.from === tx.to && method(tx, 'from') === method(tx, 'to')) errors.push('Выберите разные кошельки или способы');
  } else errors.push('Неизвестный тип операции');
  return errors;
}

/** Способ оплаты операции; у старых записей без поля считается «карта». */
export const method = (t, side) => (side === 'from' ? t.fromMethod : side === 'to' ? t.toMethod : t.method) || 'card';

/** Остатки по кошелькам с разбивкой на карту и наличные. */
export function balancesByMethod(txs) {
  const z = () => ({ card: 0, cash: 0 });
  const b = { max: z(), dinara: z(), joint: z() };
  for (const t of txs) {
    if (t.type === 'income') b[t.wallet][method(t)] += t.amount;
    else if (t.type === 'expense') b[t.paidFrom][method(t)] -= t.amount;
    else if (t.type === 'transfer') { b[t.from][method(t, 'from')] -= t.amount; b[t.to][method(t, 'to')] += t.amount; }
  }
  return b;
}

/** Остатки по кошелькам. Общий котёл меняется ТОЛЬКО если деньги реально через него прошли. */
export function balances(txs) {
  const m = balancesByMethod(txs);
  return { max: m.max.card + m.max.cash, dinara: m.dinara.card + m.dinara.cash, joint: m.joint.card + m.joint.cash };
}

/** Сколько всего потрачено картой и наличными. */
export function spendByMethod(txs) {
  const r = { card: 0, cash: 0 };
  for (const t of txs) if (t.type === 'expense') r[method(t)] += t.amount;
  return r;
}

/**
 * Долг между вами. Положительное число — Динара должна Максиму, отрицательное — Максим Динаре.
 * Общая трата с кошелька Максима: Динара должна ему свою долю. Из общего котла — долга нет.
 */
export function debt(txs) {
  let d = 0;
  for (const t of txs) {
    if (t.type === 'expense' && t.scope === 'shared') {
      const s = splitAmount(t.amount, t.shareMax);
      if (t.paidFrom === 'max') d += s.dinara;
      else if (t.paidFrom === 'dinara') d -= s.max;
    } else if (t.type === 'transfer') {
      if (t.from === 'max' && t.to === 'dinara') d += t.amount;
      else if (t.from === 'dinara' && t.to === 'max') d -= t.amount;
    }
  }
  return d;
}

/** Сводка по каждому человеку. */
export function stats(txs) {
  const blank = () => ({ earned: 0, personal: 0, sharedShare: 0, toJoint: 0 });
  const s = { max: blank(), dinara: blank() };
  for (const t of txs) {
    if (t.type === 'income') s[t.person].earned += t.amount;
    else if (t.type === 'expense') {
      if (t.scope === 'personal') s[t.person].personal += t.amount;
      else {
        const p = splitAmount(t.amount, t.shareMax);
        s.max.sharedShare += p.max;
        s.dinara.sharedShare += p.dinara;
      }
    } else if (t.type === 'transfer' && t.to === 'joint' && t.from !== 'joint') s[t.from].toJoint += t.amount;
  }
  return s;
}

/** Доля Максима в % пропорционально доходам (по умолчанию 50, если доходов нет). */
export function shareByIncome(txs) {
  const s = stats(txs);
  const total = s.max.earned + s.dinara.earned;
  return total === 0 ? 50 : Math.round((s.max.earned / total) * 100);
}

/** Операции за месяц 'YYYY-MM'. */
export const inMonth = (txs, ym) => txs.filter((t) => t.date.startsWith(ym));

export const formatMoney = (kop) => {
  const sign = kop < 0 ? '−' : '';
  const abs = Math.abs(kop);
  const rub = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = abs % 100;
  return `${sign}${rub}${cents ? ',' + String(cents).padStart(2, '0') : ''} ₽`;
};

/** '1 234,5' → 123450 копеек; null если не число. */
export function parseMoney(str) {
  const n = Number(String(str).replace(/\s| /g, '').replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
