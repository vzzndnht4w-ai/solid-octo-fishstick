// Общие помощники интерфейса. Все экраны берут отсюда форматирование и мелкие компоненты.
import { PEOPLE, WALLETS, formatMoney } from './ledger.js';
import { store } from './store.js';
import { ic, catOf } from './icons.js';
export { ic, catOf };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const monthLabel = (ym) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
export const shiftMonth = (ym, d) => { const t = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + d, 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; };
export const dayLabel = (s) => {
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (s === todayStr()) return 'Сегодня';
  if (s === ymd(y)) return 'Вчера';
  return `${+s.slice(8)} ${MONTHS_GEN[+s.slice(5, 7) - 1]}`;
};

/** Деньги с символом валюты из настроек. */
export const money = (kop) => formatMoney(kop).replace('₽', store.get().settings.currency || '₽');

export const nameOf = (p) => PEOPLE[p];
export const init = (p) => (nameOf(p) || '?')[0].toUpperCase();
export const av = (p, cls = '') => `<span class="av ${p} ${cls}">${esc(init(p))}</span>`;
/** Окончание глагола прошедшего времени: «заработал» / «заработала». */
export const feminine = (p) => (store.get().profiles[p]?.female ? 'а' : '');
export const tile = (cat) => { const [i, h] = catOf(cat); return `<span class="tile" style="--h:${h}">${ic(i)}</span>`; };
export const methodTag = (m) => `<span class="tag">${ic(m === 'cash' ? 'cash' : 'card')}${m === 'cash' ? 'Наличные' : 'Карта'}</span>`;
export const walletName = (w) => WALLETS[w];

/** Переключатель месяцев. Кнопки с data-m обрабатывает app.js. */
export const monthSwitch = (month) => `<div class="month"><button data-m="-1" aria-label="Предыдущий месяц">${ic('left')}</button><b>${monthLabel(month)}</b><button data-m="1" aria-label="Следующий месяц">${ic('right')}</button></div>`;

/** Шапка подэкрана с кнопкой «назад». Кнопку data-back обрабатывает app.js. */
export const subHeader = (title) => `<div class="top sub"><button class="back" data-back aria-label="Назад">${ic('left')}</button><h1>${esc(title)}</h1></div>`;
