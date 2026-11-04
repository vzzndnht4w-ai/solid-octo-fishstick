import { ic, av, esc, nameOf, $ } from '../core.js';

// Группы меню: [заголовок, цвет плиток, [маршрут, иконка, название, описание]…]
const GROUPS = [
  ['Вместе', '#ec4f7e', [
    ['date', 'heart', 'Финансовое свидание', 'Раз в неделю: итоги и вопросы друг другу'],
    ['wrapped', 'star', 'Итоги месяца', 'История вашего месяца в карточках'],
    ['challenges', 'plane', 'Челленджи', 'Копим и экономим вместе'],
    ['templates', 'swap', 'Быстрые шаблоны', 'Частые траты в одно касание'],
  ]],
  ['Планы', '#e59a2c', [
    ['budgets', 'chart', 'Бюджеты', 'Лимиты на категории'],
    ['goals', 'bank', 'Цели', 'Копим вместе'],
    ['recurring', 'swap', 'Регулярные платежи', 'Аренда, подписки, зарплата'],
    ['calendar', 'list', 'Календарь платежей', 'Что спишется в ближайшие дни'],
  ]],
  ['Приложение', '#3d6cf2', [
    ['settings', 'bulb', 'Настройки', 'Тема, валюта, категории, автоблокировка'],
    ['sync', 'cloud', 'Синхронизация', 'Общие данные на двух телефонах'],
    ['data', 'download', 'Данные', 'Резервная копия, экспорт'],
  ]],
];

export default {
  render(s) {
    return `<div class="top"><h1>Ещё</h1></div><div class="stack">
    <button class="card profile-row" data-go="profile"><span class="row" style="justify-content:flex-start;gap:12px">${av(s.viewer)}<span style="text-align:left"><b>${esc(nameOf(s.viewer))}</b><br><span class="muted sm">Мой профиль</span></span></span><span class="muted">${ic('right')}</span></button>
    ${GROUPS.map(([h, color, items]) => `<h2 style="margin-bottom:0">${h}</h2><div class="list">${items.map(([r, i, t, d]) => `<button class="tx" data-go="${r}"><span class="tile" style="--h:${color}">${ic(i)}</span><div class="mid"><b>${t}</b><div class="sub">${d}</div></div><span class="muted">${ic('right')}</span></button>`).join('')}</div>`).join('')}
    <button class="ghost" data-switch>Я — ${esc(nameOf(s.viewer === 'max' ? 'dinara' : 'max'))}</button>
    <p class="muted sm" style="text-align:center">Версия 0.4 · данные хранятся на этом телефоне</p></div>`;
  },
  bind(root, s, a) {
    root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => a.go(b.dataset.go)));
  },
};
