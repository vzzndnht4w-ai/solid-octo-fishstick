import { ic, av, esc, nameOf, $ } from '../core.js';
import { load as loadInbox, unreadCount } from '../lib/inbox.js';

// Группы меню: [заголовок, цвет плиток, [маршрут, иконка, название, описание]…]
const GROUPS = [
  ['Вместе', 'var(--max)', [
    ['date', 'heart', 'Финансовое свидание', 'Раз в неделю: итоги и вопросы друг другу'],
    ['wrapped', 'sparkle', 'Итоги месяца', 'История вашего месяца в карточках'],
    ['challenges', 'flame', 'Челленджи', 'Копим и экономим вместе'],
    ['templates', 'qbolt', 'Быстрые шаблоны', 'Частые траты в одно касание'],
  ]],
  ['Планы', 'var(--joint)', [
    ['savings', 'bank', 'Накопления', 'Наличные, карты, счета и вклады'],
    ['budgets', 'gauge', 'Бюджеты', 'Лимиты на категории'],
    ['goals', 'target', 'Цели', 'Копим вместе'],
    ['recurring', 'refresh', 'Регулярные платежи', 'Аренда, подписки, зарплата'],
    ['calendar', 'calendar', 'Календарь платежей', 'Что спишется в ближайшие дни'],
  ]],
  ['Приложение', 'var(--dinara)', [
    ['inbox', 'bell', 'Что нового', 'Действия партнёра и напоминания'],
    ['settings', 'bulb', 'Настройки', 'Тема, валюта, категории, автоблокировка'],
    ['sync', 'cloud', 'Синхронизация', 'Общие данные на двух телефонах'],
    ['notifications', 'bell', 'Уведомления', 'Напоминания и новости от партнёра'],
    ['data', 'download', 'Данные', 'Резервная копия, экспорт'],
  ]],
];

export default {
  render(s) {
    const unread = unreadCount(loadInbox(s.viewer));
    return `<div class="top"><h1>Ещё</h1></div><div class="stack">
    <button class="card profile-row" data-go="profile"><span class="row" style="justify-content:flex-start;gap:12px">${av(s.viewer)}<span style="text-align:left"><b>${esc(nameOf(s.viewer))}</b><br><span class="muted sm">Мой профиль</span></span></span><span class="muted">${ic('right')}</span></button>
    ${GROUPS.map(([h, color, items]) => `<h2 style="margin-bottom:0">${h}</h2><div class="list">${items.map(([r, i, t, d]) => `<button class="tx" data-go="${r}"><span class="tile" style="--h:${color}">${ic(i)}</span><div class="mid"><b>${t}</b><div class="sub">${d}</div></div>${r === 'inbox' && unread ? `<span class="mcount" aria-label="Непрочитанных: ${unread}">${unread}</span>` : ''}<span class="muted">${ic('right')}</span></button>`).join('')}</div>`).join('')}
    <button class="ghost" data-switch>Я — ${esc(nameOf(s.viewer === 'max' ? 'dinara' : 'max'))}</button>
    <p class="muted sm" style="text-align:center">Версия 0.4 · данные хранятся на этом телефоне</p></div>`;
  },
  bind(root, s, a) {
    root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => a.go(b.dataset.go)));
  },
};
