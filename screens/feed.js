import { inMonth, method as methodOf } from '../ledger.js';
import { ic, esc, nameOf, feminine, tile, methodTag, money as fm, monthSwitch, dayLabel, $, $$ } from '../core.js';
import { registerIcons } from '../icons.js';
import { store } from '../store.js';
import { txBadge } from '../lib/together-ui.js';
import { isSecret, isPendingSurprise, shortDate } from '../lib/tools.js';

registerIcons({ search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4' });

/** Как показать операцию в списке и в шторке. */
export function txView(t, viewer) {
  const secret = isSecret(t, viewer);
  if (t.type === 'saving') {
    const sv = (store.get().savings || []).find((x) => x.id === t.savingId), nm = sv ? sv.name : 'накопления';
    const wn = t.wallet === 'joint' ? 'общий баланс' : nameOf(t.wallet);
    return { icon: `<span class="tile" style="--h:var(--max)">${ic('bank')}</span>`, title: t.amount > 0 ? `В накопления «${esc(nm)}»` : `Из накоплений «${esc(nm)}»`, sub: `${t.amount > 0 ? 'из' : 'в'}: ${esc(wn)} · ${methodOf(t) === 'cash' ? 'наличные' : 'карта'}${t.note ? ' · ' + esc(t.note) : ''}`, amt: fm(Math.abs(t.amount)), cls: '' };
  }
  const mname = (m) => (m === 'cash' ? 'наличные' : 'карта');
  if (t.type === 'transfer') {
    const same = t.from === t.to, mf = methodOf(t, 'from'), mt = methodOf(t, 'to');
    const settle = !same && t.from !== 'joint' && t.to !== 'joint';
    const goal = t.goalId ? (store.get().goals || []).find((g) => g.id === t.goalId) : null;
    if (t.goalId) {
      const gn = goal ? goal.name : 'цель';
      return { icon: `<span class="tile" style="--h:var(--joint)">${ic('bank')}</span>`, title: t.amount < 0 ? `Из цели «${esc(gn)}»` : `В цель «${esc(gn)}»`, sub: t.from === t.to ? (t.amount < 0 ? 'вернули в свободный баланс' : 'из общего баланса') : `с кошелька: ${esc(nameOf(t.from))}`, amt: fm(Math.abs(t.amount)), cls: '' };
    }
    const title = same ? (mt === 'cash' ? 'Снятие наличных' : 'Внесение на карту') : settle ? 'Взаиморасчёт' : t.to === 'joint' ? 'В общий баланс' : t.from === 'joint' ? 'Из общего баланса' : 'Перевод';
    const short = (w) => (w === 'joint' ? 'баланс' : nameOf(w));
    const route = same ? short(t.from) : `${short(t.from)} → ${short(t.to)}`;
    return { icon: `<span class="tile" style="--h:var(--dinara)">${ic('swap')}</span>`, title, sub: `${esc(route)} · ${mf === mt ? mname(mf) : mname(mf) + ' → ' + mname(mt)}`, amt: fm(t.amount), cls: '' };
  }
  const m = methodTag(methodOf(t));
  const icon = secret ? `<span class="tile" style="--h:var(--muted)">${ic('lock')}</span>` : tile(t.category);
  const title = secret ? 'Скрыто' : t.category;
  const sur = isPendingSurprise(t, viewer) ? `<span class="tag surprise">${ic('gift')}Сюрприз до ${shortDate(t.revealOn)}</span>` : '';
  const note = !secret && t.note ? `<span>${esc(t.note)}</span>` : '';
  if (t.type === 'income') return { icon, title, sub: `<span class="tag ${t.person}">${esc(nameOf(t.person))}</span>${m}${sur}${note}`, amt: '+' + fm(t.amount), cls: 'pos' };
  const who = t.scope === 'personal'
    ? `<span class="tag ${t.person}">${esc(nameOf(t.person))} · лично</span>`
    : `<span class="tag joint">Общее ${t.shareMax}/${100 - t.shareMax}</span><span class="tag ${t.paidFrom}">${t.paidFrom === 'joint' ? 'из баланса' : 'платил' + feminine(t.paidFrom) + ' ' + esc(nameOf(t.paidFrom))}</span>`;
  return { icon, title, sub: `${who}${m}${sur}${note}`, amt: '−' + fm(t.amount), cls: '' };
}

// ---------- Фильтр ленты (на уровне модуля — сохраняется при переключении вкладок) ----------
const blank = () => ({ q: '', type: 'all', who: 'all', scope: 'all', method: 'all', cat: null, allTime: false });
let filter = blank();
let fopen = false; // раскрыта ли панель фильтров
/** Частично обновить фильтр: setFilter({ cat: 'Продукты', type: 'expense' }). Применяется при следующем показе ленты. */
export const setFilter = (obj = {}) => { filter = { ...filter, ...obj }; };
export const resetFilter = () => { filter = blank(); };
const isActive = (f) => !!(f.q.trim() || f.type !== 'all' || f.who !== 'all' || f.scope !== 'all' || f.method !== 'all' || f.cat);

const norm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е');
/** Подходит ли операция под фильтр f с точки зрения viewer. Чужие скрытые не находятся по категории/заметке. */
export function matches(t, f, viewer) {
  if (f.type !== 'all' && t.type !== f.type) return false;
  if (f.who !== 'all') {
    const hit = t.type === 'transfer' ? t.from === f.who || t.to === f.who : t.person === f.who;
    if (!hit) return false;
  }
  if (f.scope !== 'all' && !(t.type === 'expense' && t.scope === f.scope)) return false;
  if (f.method !== 'all') {
    const ok = t.type === 'transfer' ? methodOf(t, 'from') === f.method || methodOf(t, 'to') === f.method : methodOf(t) === f.method;
    if (!ok) return false;
  }
  const secret = isSecret(t, viewer);
  if (f.cat && (secret || t.category !== f.cat)) return false;
  const q = norm(f.q).trim();
  if (q) {
    const rub = String(t.amount / 100);
    const digits = q.replace(/[\s ]/g, '').replace(',', '.');
    const byAmount = /^\d+(\.\d*)?$/.test(digits) && (rub.includes(digits) || (t.amount / 100).toFixed(2).includes(digits));
    const text = secret ? '' : norm(`${txView(t, viewer).title} ${t.category || ''} ${t.note || ''}`);
    if (!byAmount && !text.includes(q)) return false;
  }
  return true;
}

const sum = (list) => {
  let inc = 0, exp = 0;
  for (const t of list) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; }
  return { inc, exp };
};
const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 15 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
const sorted = (list) => list.sort((x, y) => y.date.localeCompare(x.date) || (y.createdAt || 0) - (x.createdAt || 0));

function listHtml(s, list) {
  const groups = [];
  for (const t of list) { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] }); }
  const year = String(new Date().getFullYear());
  let html = '';
  for (const g of groups) {
    const dayNet = g.items.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
    const label = filter.allTime && g.date.slice(0, 4) !== year ? `${dayLabel(g.date)} ${g.date.slice(0, 4)}` : dayLabel(g.date);
    html += `<div class="day"><span>${label}</span><span>${dayNet ? (dayNet > 0 ? '+' : '') + fm(dayNet) : ''}</span></div><div class="list">`;
    for (const t of g.items) { const v = txView(t, s.viewer); html += `<button class="tx" data-id="${t.id}">${v.icon}<div class="mid"><b>${esc(v.title)}</b><div class="sub">${v.sub}${txBadge(s, t)}</div></div><span class="amt ${v.cls}">${v.amt}</span></button>`; }
    html += '</div>';
  }
  return html;
}

function resultHtml(s, a) {
  const base = filter.allTime ? [...s.txs] : inMonth(s.txs, a.month);
  const list = sorted(base.filter((t) => matches(t, filter, s.viewer)));
  const active = isActive(filter);
  if (!list.length) {
    return active
      ? `<div class="empty card"><div class="big">${ic('search')}</div><b>Ничего не найдено</b><span class="muted">Измените запрос или <button class="lnk" data-fr>сбросьте фильтры</button></span></div>`
      : `<div class="empty card"><div class="big">${ic('list')}</div><b>В этом месяце пусто</b><span class="muted">Нажмите «+», чтобы записать первую операцию</span></div>`;
  }
  const { inc, exp } = sum(list);
  const summary = active
    ? `<div class="fsum" role="status"><b>Найдено: ${list.length}</b><span class="muted">${plural(list.length, 'операция', 'операции', 'операций')}</span><i></i>${inc ? `<span class="pos">+${fm(inc)}</span>` : ''}${exp ? `<span>−${fm(exp)}</span>` : ''}</div>`
    : '';
  return summary + listHtml(s, list);
}

const GROUPS = {
  type: ['Тип', () => [['all', 'Все'], ['income', 'Доходы'], ['expense', 'Расходы'], ['transfer', 'Переводы']]],
  who: ['Кто', () => [['all', 'Все'], ['max', nameOf('max')], ['dinara', nameOf('dinara')]]],
  scope: ['Общее / личное', () => [['all', 'Все'], ['shared', 'Общее'], ['personal', 'Личное']]],
  method: ['Способ', () => [['all', 'Все'], ['card', 'Карта'], ['cash', 'Наличные']]],
};

export default {
  render(s, a) {
    const groups = Object.entries(GROUPS).map(([k, [label, opts]]) => `<div class="fgroup"><span class="flab">${label}</span><div class="fchips" role="group" aria-label="${label}">${opts().map(([v, l]) => `<button class="fchip ${filter[k] === v ? 'on' : ''} ${k === 'who' && v !== 'all' ? v : ''}" data-f="${k}" data-v="${v}" aria-pressed="${filter[k] === v}">${esc(l)}</button>`).join('')}</div></div>`).join('');
    const nAct = ['type', 'who', 'scope', 'method'].filter((k) => filter[k] !== 'all').length;
    const extra = `<button class="fchip ${fopen || nAct ? 'on' : ''}" data-fx="open" aria-expanded="${fopen}">Фильтры${nAct ? ` · ${nAct}` : ''}</button>${filter.cat ? `<button class="fchip on" data-fx="cat" aria-label="Убрать категорию ${esc(filter.cat)}">${esc(filter.cat)} ${ic('x')}</button>` : ''}<button class="fchip ${filter.allTime ? 'on' : ''}" data-fx="all" aria-pressed="${filter.allTime}">Все месяцы</button>${isActive(filter) || filter.allTime ? '<button class="lnk" data-fx="reset">Сбросить</button>' : ''}`;
    return `${filter.allTime ? '<div class="top"><h1>Лента</h1></div>' : monthSwitch(a.month)}
      <div class="fbar"><label class="fsearch">${ic('search')}<input type="search" id="fq" placeholder="Заметка, категория, сумма" value="${esc(filter.q)}" autocomplete="off" enterkeyhint="search" aria-label="Поиск по операциям"></label>
      <div class="fchips fextra">${extra}</div>${fopen ? `<div class="fgroups">${groups}</div>` : ''}</div>
      <div id="fres">${resultHtml(s, a)}</div>`;
  },
  bind(root, s, a) {
    const res = $('#fres', root);
    const wire = () => {
      $$('[data-id]', res).forEach((r) => (r.onclick = () => a.openTx(r.dataset.id)));
      $$('[data-fr]', res).forEach((b) => (b.onclick = () => { resetFilter(); a.render(); }));
    };
    wire();
    const q = $('#fq', root);
    q.addEventListener('input', () => { filter.q = q.value; res.innerHTML = resultHtml(s, a); wire(); });
    $$('[data-f]', root).forEach((b) => (b.onclick = () => { filter[b.dataset.f] = b.dataset.v; a.render(); }));
    $$('[data-fx]', root).forEach((b) => (b.onclick = () => {
      const k = b.dataset.fx;
      if (k === 'cat') filter.cat = null;
      else if (k === 'open') fopen = !fopen;
      else if (k === 'all') filter.allTime = !filter.allTime;
      else if (k === 'reset') { resetFilter(); fopen = false; }
      a.render();
    }));
  },
};
