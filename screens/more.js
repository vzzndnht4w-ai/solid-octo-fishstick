import { ic, av, esc, nameOf, $ } from '../core.js';

const ITEMS = [
  ['settings', 'bulb', 'Настройки', 'Тема, валюта, категории, автоблокировка'],
  ['budgets', 'chart', 'Бюджеты', 'Лимиты на категории'],
  ['goals', 'star', 'Цели', 'Копим вместе'],
  ['recurring', 'swap', 'Регулярные платежи', 'Аренда, подписки, зарплата'],
  ['sync', 'cloud', 'Синхронизация', 'Общие данные на двух телефонах'],
  ['data', 'list', 'Данные', 'Резервная копия, экспорт'],
];

export default {
  render(s) {
    return `<div class="top"><h1>Ещё</h1></div><div class="stack">
    <button class="card profile-row" data-go="profile"><span class="row" style="justify-content:flex-start;gap:12px">${av(s.viewer)}<span style="text-align:left"><b>${esc(nameOf(s.viewer))}</b><br><span class="muted sm">Мой профиль</span></span></span><span class="muted">${ic('right')}</span></button>
    <div class="list">${ITEMS.map(([r, i, t, d]) => `<button class="tx" data-go="${r}"><span class="tile" style="--h:#7b6cf0">${ic(i)}</span><div class="mid"><b>${t}</b><div class="sub">${d}</div></div><span class="muted">${ic('right')}</span></button>`).join('')}</div>
    <button class="ghost" data-switch>Я — ${esc(nameOf(s.viewer === 'max' ? 'dinara' : 'max'))}</button>
    <p class="muted sm" style="text-align:center">Версия 0.3 · данные хранятся на этом телефоне</p></div>`;
  },
  bind(root, s, a) {
    root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => a.go(b.dataset.go)));
  },
};
