// «Что нового»: события от партнёра и напоминания по дням.
import { ic, esc, subHeader, dayLabel, ymd, $, $$ } from '../core.js';
import { registerIcons } from '../icons.js';
import { load, update, filterItems, unreadCount, markRead, markAllRead, hide, describe } from '../lib/inbox.js';
import { ctxFor } from '../lib/inbox-ui.js';

registerIcons({
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4',
  chat: 'M4 5h16v11H9l-5 4z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 1.5',
});

const FILTERS = [['all', 'Все'], ['partner', 'От партнёра'], ['reminder', 'Напоминания']];
let filter = 'all';
const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function row(ev, ctx) {
  const v = describe(ev, ctx);
  return `<li class="ib-row ${ev.r ? '' : 'unread'}"><button class="ib-main" data-ev="${esc(ev.key)}">
    <span class="tile" style="--h:${v.tone}">${ic(v.icon)}</span>
    <span class="ib-t"><b>${ev.r ? '' : '<span class="sr-only">Новое: </span>'}${esc(v.title)}</b>${v.detail ? `<span class="muted sm">${esc(v.detail)}</span>` : ''}</span></button>
    <div class="ib-side"><time class="muted sm" datetime="${new Date(ev.at).toISOString()}">${hhmm(ev.at)}</time><button class="ib-hide" data-hide="${esc(ev.key)}" aria-label="Скрыть: ${esc(v.title)}">Скрыть</button></div></li>`;
}

export default {
  render(s) {
    const box = load(s.viewer), items = filterItems(box, filter), n = unreadCount(box), ctx = ctxFor();
    const days = [];
    for (const ev of items) {
      const d = ymd(new Date(ev.at)), last = days[days.length - 1];
      if (last && last.d === d) last.list.push(ev); else days.push({ d, list: [ev] });
    }
    const empty = filter === 'all' ? ['Пока тихо', 'Здесь появятся действия партнёра и напоминания: бюджеты, платежи, долги, цели.']
      : filter === 'partner' ? ['От партнёра пока ничего', 'Когда партнёр добавит операцию или оставит реакцию, это появится здесь.'] : ['Напоминаний нет', 'Мы подскажем, когда бюджет будет на исходе или подойдёт платёж.'];
    return `${subHeader('Что нового')}<div class="stack">
      <div class="ib-bar"><div class="ib-seg" role="group" aria-label="Фильтр">${FILTERS.map(([k, l]) => `<button data-f="${k}" aria-pressed="${filter === k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="ib-all" data-readall ${n ? '' : 'disabled'}>${ic('check')}Отметить всё прочитанным</button></div>
      <p class="sr-only" role="status">${n ? `Непрочитанных: ${n}` : 'Всё прочитано'}</p>
      ${items.length ? days.map(({ d, list }) => `<h2 class="ib-day">${esc(dayLabel(d))}</h2><ul class="list ib-list">${list.map((e) => row(e, ctx)).join('')}</ul>`).join('')
        : `<div class="empty"><div class="big">${ic('bell')}</div><h1>${empty[0]}</h1><p class="muted">${empty[1]}</p></div>`}</div>`;
  },
  bind(root, s, a) {
    const v = s.viewer, keep = (key) => { const el = key && $(`[data-f="${key}"]`, root); if (el) el.focus({ preventScroll: true }); };
    $$('[data-f]', root).forEach((b) => (b.onclick = () => { filter = b.dataset.f; a.render(); keep(filter); }));
    const all = $('[data-readall]', root);
    if (all) all.onclick = () => { update(v, markAllRead); a.render(); a.toast('Всё отмечено прочитанным'); };
    $$('[data-hide]', root).forEach((b) => (b.onclick = () => { update(v, (box) => hide(box, b.dataset.hide)); a.render(); }));
    $$('[data-ev]', root).forEach((b) => (b.onclick = () => {
      const key = b.dataset.ev, ev = load(v).items.find((x) => x.key === key); if (!ev) return;
      update(v, (box) => markRead(box, key));
      if (ev.route === 'tx' && ev.arg) { a.render(); if (s.txs.some((t) => t.id === ev.arg)) a.openTx(ev.arg); else a.toast('Операция уже удалена'); }
      else a.go(ev.route || 'home');
    }));
  },
};
