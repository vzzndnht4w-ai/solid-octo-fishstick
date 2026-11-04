import { PEOPLE, WALLETS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, other, balancesByMethod, debt, stats, spendByMethod, splitAmount, shareByIncome, inMonth, validate, method as methodOf, formatMoney as fm, parseMoney } from './ledger.js';
import { store } from './store.js';
import { ic, catOf } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view'), nav = $('#tabs'), sheet = $('#sheet');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const monthLabel = (ym) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
const shiftMonth = (ym, d) => { const t = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + d, 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; };
const dayLabel = (s) => {
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (s === todayStr()) return 'Сегодня';
  if (s === ymd(y)) return 'Вчера';
  return `${+s.slice(8)} ${MONTHS_GEN[+s.slice(5, 7) - 1]}`;
};
const nameOf = (p) => PEOPLE[p];
const init = (p) => nameOf(p)[0];
const av = (p, cls = '') => `<span class="av ${p} ${cls}">${init(p)}</span>`;
const feminine = (p) => (p === 'dinara' ? 'а' : '');
const tile = (cat) => { const [i, h] = catOf(cat); return `<span class="tile" style="--h:${h}">${ic(i)}</span>`; };
const methodTag = (m) => `<span class="tag">${ic(m === 'cash' ? 'cash' : 'card')}${m === 'cash' ? 'Наличные' : 'Карта'}</span>`;

let tab = 'home';
let month = todayStr().slice(0, 7);
let draft = null;
let error = '';

const newDraft = (viewer) => ({ editId: null, type: 'expense', amount: '', person: viewer, category: EXPENSE_CATEGORIES[0], scope: 'shared', paidFrom: viewer, method: 'card', shareMax: 50, note: '', hidden: false, wallet: viewer, from: viewer, fromMethod: 'card', to: 'joint', toMethod: 'card', date: todayStr() });
const draftFrom = (t) => ({ ...newDraft(t.person || t.from || 'max'), ...t, editId: t.id, amount: String(t.amount / 100).replace('.', ','), method: methodOf(t), fromMethod: methodOf(t, 'from'), toMethod: methodOf(t, 'to'), note: t.note || '', hidden: !!t.hidden });

// ---------- Экран выбора ----------
function renderWho() {
  nav.innerHTML = '';
  view.innerHTML = `<div class="stack" style="padding-top:12vh;text-align:center">
    <div class="empty" style="padding-bottom:0"><div class="big">${ic('users')}</div><h1>Мы</h1><p class="muted">Деньги вдвоём: у каждого своё, и общее тоже.<br>Кто сейчас с телефоном?</p></div>
    <button class="primary" data-who="max" style="background:linear-gradient(135deg,var(--max),var(--max2))">Я — Максим</button>
    <button class="primary" data-who="dinara" style="margin-top:0;background:linear-gradient(135deg,var(--dinara),var(--dinara2))">Я — Динара</button></div>`;
  view.querySelectorAll('[data-who]').forEach((b) => (b.onclick = () => { store.setViewer(b.dataset.who); draft = null; }));
}

// ---------- Главная ----------
const monthSwitch = () => `<div class="month"><button data-m="-1" aria-label="Предыдущий месяц">${ic('left')}</button><b>${monthLabel(month)}</b><button data-m="1" aria-label="Следующий месяц">${ic('right')}</button></div>`;

function renderHome(s) {
  const all = s.txs, bm = balancesByMethod(all), d = debt(all);
  const ms = stats(inMonth(all, month));
  const jointTotal = bm.joint.card + bm.joint.cash;
  const hero = `<section class="hero"><div class="lab">${ic('bank')} Общий котёл</div><div class="sum">${fm(jointTotal)}</div>
    <div class="split"><span><em>${ic('card')} Карта</em><b>${fm(bm.joint.card)}</b></span><span><em>${ic('cash')} Наличные</em><b>${fm(bm.joint.cash)}</b></span></div></section>`;
  const settle = d === 0
    ? `<div class="settle"><span class="av joint">${ic('users')}</span><div class="t"><b>Вы квиты</b><span class="muted sm">Никто никому не должен</span></div></div>`
    : `<div class="settle">${av(d > 0 ? 'dinara' : 'max')}<span class="arrow">${ic('arrow')}</span>${av(d > 0 ? 'max' : 'dinara')}<div class="t"><b>${fm(Math.abs(d))}</b><span class="muted sm">${d > 0 ? 'Динара должна Максиму' : 'Максим должен Динаре'}</span></div></div>`;
  const person = (p) => {
    const spent = ms[p].personal + ms[p].sharedShare, left = ms[p].earned - spent;
    const pct = ms[p].earned ? Math.min(100, Math.round((spent / ms[p].earned) * 100)) : spent ? 100 : 0;
    return `<div class="pcard ${p}"><div class="h">${av(p, 'sm')}${nameOf(p)}</div>
      <div class="kv"><small>Заработал${feminine(p)}</small><b class="pos">${fm(ms[p].earned)}</b></div>
      <div class="kv"><small>Потратил${feminine(p)}</small><b>${fm(spent)}</b></div>
      <div class="mini" title="${pct}% дохода потрачено"><i style="width:${pct}%"></i></div>
      <div class="kv"><small>Остаток за месяц</small><b class="${left < 0 ? 'neg' : ''}">${fm(left)}</b></div>
      <div class="wallet"><span>${ic('card')}${fm(bm[p].card)}</span><span>${ic('cash')}${fm(bm[p].cash)}</span></div></div>`;
  };
  const first = !all.length ? `<div class="tip"><span class="tile">${ic('bulb')}</span><div><b>Начните с дохода</b><br><span class="muted">Нажмите «+», выберите «Доход» и запишите зарплату. Потом пополните общий котёл переводом.</span></div></div>` : '';
  return `<div class="top"><div class="hello"><div class="muted">Привет,</div><b>${nameOf(s.viewer)}</b></div><button class="av ${s.viewer}" data-switch aria-label="Сменить пользователя">${init(s.viewer)}</button></div>
  ${monthSwitch()}<div class="stack">${first}${hero}<div class="card">${settle}</div></div>
  <h2>За ${monthLabel(month).split(' ')[0].toLowerCase()}</h2><div class="people">${person('max')}${person('dinara')}</div>`;
}

// ---------- Лента ----------
function txView(t, viewer) {
  const secret = t.hidden && t.person !== viewer;
  if (t.type === 'transfer') {
    const cashOut = t.from === t.to && methodOf(t, 'to') === 'cash', settle = t.from !== t.to && t.from !== 'joint' && t.to !== 'joint';
    const mf = methodOf(t, 'from'), mt = methodOf(t, 'to');
    const title = t.from === t.to ? (cashOut ? 'Снятие наличных' : 'Внесение на карту') : settle ? 'Взаиморасчёт' : t.to === 'joint' ? 'В общий котёл' : t.from === 'joint' ? 'Из общего котла' : 'Перевод';
    const route = t.from === t.to ? `${nameOf(t.from) || 'Котёл'}` : `${WALLETS[t.from].split(' ').pop()} → ${WALLETS[t.to].split(' ').pop()}`;
    return { icon: `<span class="tile" style="--h:#7b6cf0">${ic('swap')}</span>`, title, sub: `${route} · ${mf === mt ? (mf === 'cash' ? 'наличные' : 'карта') : (mf === 'cash' ? 'наличные' : 'карта') + ' → ' + (mt === 'cash' ? 'наличные' : 'карта')}`, amt: fm(t.amount), cls: '' };
  }
  const m = methodTag(methodOf(t));
  const icon = secret ? `<span class="tile" style="--h:#858aa0">${ic('lock')}</span>` : tile(t.category);
  const title = secret ? 'Скрыто' : t.category;
  const note = !secret && t.note ? `<span>${esc(t.note)}</span>` : '';
  if (t.type === 'income') return { icon, title, sub: `<span class="tag ${t.person}">${nameOf(t.person)}</span>${m}${note}`, amt: '+' + fm(t.amount), cls: 'pos' };
  const who = t.scope === 'personal' ? `<span class="tag ${t.person}">${nameOf(t.person)} · лично</span>` : `<span class="tag joint">Общее ${t.shareMax}/${100 - t.shareMax}</span><span class="tag ${t.paidFrom}">${t.paidFrom === 'joint' ? 'из котла' : 'платил' + feminine(t.paidFrom) + ' ' + nameOf(t.paidFrom)}</span>`;
  return { icon, title, sub: `${who}${m}${note}`, amt: '−' + fm(t.amount), cls: '' };
}

function renderFeed(s) {
  const list = inMonth(s.txs, month).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  let html = monthSwitch();
  if (!list.length) return html + `<div class="empty card"><div class="big">${ic('list')}</div><b>В этом месяце пусто</b><span class="muted">Нажмите «+», чтобы записать первую операцию</span></div>`;
  const groups = [];
  for (const t of list) { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] }); }
  for (const g of groups) {
    const dayNet = g.items.reduce((a, t) => a + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
    html += `<div class="day"><span>${dayLabel(g.date)}</span><span>${dayNet ? (dayNet > 0 ? '+' : '') + fm(dayNet) : ''}</span></div><div class="list">`;
    for (const t of g.items) { const v = txView(t, s.viewer); html += `<button class="tx" data-id="${t.id}">${v.icon}<div class="mid"><b>${esc(v.title)}</b><div class="sub">${v.sub}</div></div><span class="amt ${v.cls}">${v.amt}</span></button>`; }
    html += '</div>';
  }
  return html;
}

// ---------- Итоги ----------
function renderStats(s) {
  const txs = inMonth(s.txs, month), st = stats(txs), sp = spendByMethod(txs);
  const cmp = (label, k) => { const a = st.max[k], b = st.dinara[k], t = a + b || 1; return `<div class="card cmp"><div class="muted sm">${label}</div><div class="nums"><span>${fm(a)}</span><span>${fm(b)}</span></div><div class="duo"><i style="width:${(a / t) * 100}%"></i><i style="width:${(b / t) * 100}%"></i></div></div>`; };
  const byCat = {};
  for (const t of txs) if (t.type === 'expense' && !(t.hidden && t.person !== s.viewer)) { const k = t.category; byCat[k] = (byCat[k] || 0) + (t.scope === 'shared' ? t.amount : t.amount); }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), top = cats[0]?.[1] || 1;
  const spTotal = sp.card + sp.cash || 1;
  return `${monthSwitch()}<div class="stack">
    <div class="row sm muted" style="padding:0 6px"><span>${av('max', 'sm')} Максим</span><span>Динара ${av('dinara', 'sm')}</span></div>
    ${cmp('Заработали', 'earned')}${cmp('Личные траты', 'personal')}${cmp('Доля в общих тратах', 'sharedShare')}</div>
  <h2>Карта и наличные</h2><div class="card cmp"><div class="nums" style="color:var(--ink)"><span style="color:var(--ink)">${ic('card')} ${fm(sp.card)}</span><span style="color:var(--ink)">${fm(sp.cash)} ${ic('cash')}</span></div><div class="duo"><i style="width:${(sp.card / spTotal) * 100}%;background:var(--max)"></i><i style="width:${(sp.cash / spTotal) * 100}%;background:var(--joint)"></i></div></div>
  <h2>Куда уходят деньги</h2><div class="card">${cats.length ? cats.map(([k, v]) => { const [, h] = catOf(k); return `<div class="cat" style="--h:${h}">${tile(k)}<div class="g"><div class="row"><b style="font-weight:600">${esc(k)}</b><b>${fm(v)}</b></div><div class="bar"><i style="width:${(v / top) * 100}%"></i></div></div></div>`; }).join('') : '<div class="muted" style="text-align:center;padding:12px">Расходов пока нет</div>'}</div>`;
}

// ---------- Форма ----------
const chips = (name, items, cur, cls = () => '') => `<div class="chips" data-chips="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="chip ${cls(v)} ${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const personChips = (name, cur) => chips(name, Object.keys(PEOPLE).map((p) => [p, `${av(p, 'sm')}${nameOf(p)}`]), cur, (v) => v);
const walletChips = (name, cur) => chips(name, Object.entries(WALLETS).map(([w, l]) => [w, l]), cur, (v) => v);
const methodChips = (name, cur) => chips(name, [['card', `${ic('card')} Карта`], ['cash', `${ic('cash')} Наличные`]], cur);
const catGrid = (list, cur) => `<div class="cats" data-chips="category">${list.map((c) => { const [i, h] = catOf(c); return `<button type="button" data-v="${c}" class="catb ${cur === c ? 'on' : ''}" style="--h:${h}"><span class="tile" style="--h:${h}">${ic(i)}</span>${c}</button>`; }).join('')}</div>`;

function renderAdd() {
  const dr = draft;
  let h = `<div class="top"><h1>${dr.editId ? 'Изменить' : 'Новая операция'}</h1>${dr.editId ? `<button class="av joint" data-cancel aria-label="Отмена">${ic('x')}</button>` : ''}</div>
  <div class="seg" data-chips="type">${[['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']].map(([v, l]) => `<button type="button" data-v="${v}" class="${dr.type === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="card amount" style="margin-top:12px"><input id="f-amount" inputmode="decimal" placeholder="0" value="${esc(dr.amount)}" aria-label="Сумма"><span>₽</span></div>`;
  if (dr.type !== 'transfer') h += `<label class="l">Кто</label>${personChips('person', dr.person)}`;
  if (dr.type === 'expense') {
    h += `<label class="l">Категория</label>${catGrid(EXPENSE_CATEGORIES, dr.category)}
    <label class="l">Чья это трата</label><div class="opts" data-chips="scope">
      <button type="button" data-v="personal" class="opt ${dr.scope === 'personal' ? 'on' : ''}"><b>${ic('user')} Личная</b><small>Только ${nameOf(dr.person)}. Общий баланс и долги не меняются.</small></button>
      <button type="button" data-v="shared" class="opt ${dr.scope === 'shared' ? 'on' : ''}"><b>${ic('users')} Общая</b><small>Делим на двоих в нужной пропорции.</small></button></div>
    <label class="l">Чем заплатили</label>${methodChips('method', dr.method)}`;
    if (dr.scope === 'personal') h += `<div class="preview">Спишется из «${WALLETS[dr.person]}». Общий котёл не затрагивается.</div>`;
    else h += `<label class="l">Откуда деньги</label>${walletChips('paidFrom', dr.paidFrom)}
      <label class="l" id="f-sharelabel"></label><input type="range" id="f-share" min="0" max="100" step="5" value="${dr.shareMax}" aria-label="Доля Максима">
      <div class="chips" style="margin-top:10px"><button type="button" class="chip" data-share="50">50/50</button><button type="button" class="chip" data-share="60">60/40</button><button type="button" class="chip" data-share="70">70/30</button><button type="button" class="chip" data-share="income">По доходам</button></div>
      <div class="preview" id="f-preview"></div>`;
  } else if (dr.type === 'income') {
    h += `<label class="l">Категория</label>${catGrid(INCOME_CATEGORIES, dr.category)}
    <label class="l">Куда пришли деньги</label>${walletChips('wallet', dr.wallet)}<label class="l">Способ</label>${methodChips('method', dr.method)}`;
  } else {
    h += `<label class="l">Быстро</label><div class="chips"><button type="button" class="chip" data-preset="cash">${ic('cash')} Снял(а) наличные</button><button type="button" class="chip" data-preset="joint">${ic('bank')} В общий котёл</button><button type="button" class="chip" data-preset="settle">${ic('swap')} Вернул(а) долг</button></div>
    <label class="l">Откуда</label>${walletChips('from', dr.from)}<div style="height:8px"></div>${methodChips('fromMethod', dr.fromMethod)}
    <label class="l">Куда</label>${walletChips('to', dr.to)}<div style="height:8px"></div>${methodChips('toMethod', dr.toMethod)}
    <div class="preview">Перевод в «Общий котёл» — пополнение, а не расход. Между вашими кошельками — взаиморасчёт, он гасит долг.</div>`;
  }
  h += `<label class="l">Дата</label><input type="date" id="f-date" value="${dr.date}"><label class="l">Заметка</label><input id="f-note" placeholder="Необязательно" value="${esc(dr.note)}">`;
  if (dr.type !== 'transfer') h += `<label class="switch"><span>Скрыть детали от партнёра<br><span class="muted sm">Будет видна только сумма</span></span><input type="checkbox" id="f-hidden" ${dr.hidden ? 'checked' : ''}></label>`;
  return h + `${error ? `<div class="error">${esc(error)}</div>` : ''}<button class="primary" id="f-save">${dr.editId ? 'Сохранить изменения' : 'Добавить'}</button>`;
}

function renderMore(s) {
  return `<div class="top"><h1>Ещё</h1></div><div class="stack">
  <div class="card"><div class="row"><span class="row" style="gap:10px;justify-content:flex-start">${av(s.viewer)}<span><b>${nameOf(s.viewer)}</b><br><span class="muted sm">сейчас пользуется</span></span></span><button class="chip" id="switch">Сменить</button></div></div>
  <h2 style="margin-bottom:0">Данные</h2>
  <button class="ghost" id="export">Скопировать резервную копию</button><button class="ghost" id="import">Восстановить из копии</button><button class="ghost danger" id="reset">Удалить все операции</button>
  <p class="muted sm" style="text-align:center">Операций: ${s.txs.length}. Версия 0.2.<br>Пока данные хранятся только на этом телефоне.</p></div>`;
}

// ---------- Шторка операции ----------
let confirmDel = false;
function openSheet(id) {
  const s = store.get(), t = s.txs.find((x) => x.id === id); if (!t) return;
  const v = txView(t, s.viewer), mine = !t.hidden || t.person === s.viewer;
  const kv = (k, val) => `<div class="row"><span class="muted">${k}</span><b>${val}</b></div>`;
  let rows = kv('Дата', `${dayLabel(t.date)}, ${t.date.slice(8)}.${t.date.slice(5, 7)}.${t.date.slice(0, 4)}`);
  if (t.type === 'expense') rows += kv('Кто', nameOf(t.person)) + kv('Тип', t.scope === 'personal' ? 'Личная' : `Общая, ${t.shareMax}/${100 - t.shareMax}`) + kv('Откуда', WALLETS[t.paidFrom]) + kv('Способ', methodOf(t) === 'cash' ? 'Наличные' : 'Карта');
  if (t.type === 'income') rows += kv('Кто', nameOf(t.person)) + kv('Куда', WALLETS[t.wallet]) + kv('Способ', methodOf(t) === 'cash' ? 'Наличные' : 'Карта');
  if (t.type === 'transfer') rows += kv('Откуда', WALLETS[t.from]) + kv('Куда', WALLETS[t.to]);
  if (t.note && mine) rows += kv('Заметка', esc(t.note));
  sheet.hidden = false;
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="row" style="justify-content:flex-start;gap:12px">${v.icon}<div><b style="font-size:18px">${esc(v.title)}</b></div></div>
    <div class="big ${v.cls}" style="margin-top:12px">${v.amt}</div><div class="kvs">${rows}</div>
    <div class="btns">${confirmDel ? `<button data-sheet="cancel">Не удалять</button><button class="del" data-sheet="del2">Да, удалить</button>` : `<button data-sheet="edit" ${mine ? '' : 'disabled style="opacity:.4"'}>Изменить</button><button class="del" data-sheet="del">Удалить</button>`}</div></div>`;
  const close = () => { sheet.hidden = true; sheet.innerHTML = ''; confirmDel = false; };
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  sheet.querySelectorAll('[data-sheet]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.sheet;
    if (a === 'edit') { close(); draft = draftFrom(t); tab = 'add'; render(); window.scrollTo(0, 0); }
    else if (a === 'del') { confirmDel = true; openSheet(id); }
    else if (a === 'cancel') { confirmDel = false; openSheet(id); }
    else if (a === 'del2') { close(); store.remove(id); }
  }));
}

// ---------- Работа формы ----------
function readForm() {
  if (!draft) return;
  const g = (id) => $('#' + id);
  if (g('f-amount')) draft.amount = g('f-amount').value;
  if (g('f-note')) draft.note = g('f-note').value;
  if (g('f-date')) draft.date = g('f-date').value;
  if (g('f-hidden')) draft.hidden = g('f-hidden').checked;
  if (g('f-share')) draft.shareMax = +g('f-share').value;
}

function updatePreview() {
  const lab = $('#f-sharelabel'), pv = $('#f-preview');
  if (!lab || !pv) return;
  readForm();
  const sp = splitAmount(parseMoney(draft.amount) || 0, draft.shareMax), pf = draft.paidFrom;
  lab.textContent = `Как делим: Максим ${draft.shareMax}% · Динара ${100 - draft.shareMax}%`;
  const debtor = other(pf);
  pv.innerHTML = `Максим: <b>${fm(sp.max)}</b> · Динара: <b>${fm(sp.dinara)}</b><br>` + (pf === 'joint' ? 'Платим из котла — долгов не возникает.' : `Платил${feminine(pf)} ${nameOf(pf)}: ${nameOf(debtor)} ${debtor === 'max' ? 'будет должен' : 'будет должна'} свою долю. Котёл не меняется.`);
}

function setChip(name, v) {
  readForm(); error = '';
  draft[name] = v;
  if (name === 'type') draft.category = v === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
  if (name === 'person') { draft.wallet = v; draft.paidFrom = v; draft.from = v; }
  if (name === 'scope') draft.paidFrom = draft.person;
  render();
}

function preset(kind) {
  readForm(); const p = draft.person || store.get().viewer;
  if (kind === 'cash') Object.assign(draft, { from: p, fromMethod: 'card', to: p, toMethod: 'cash' });
  if (kind === 'joint') Object.assign(draft, { from: p, fromMethod: 'card', to: 'joint', toMethod: 'card' });
  if (kind === 'settle') Object.assign(draft, { from: p, fromMethod: 'card', to: other(p), toMethod: 'card' });
  render();
}

function save() {
  readForm();
  const amount = parseMoney(draft.amount);
  let tx = { type: draft.type, amount, date: draft.date || todayStr(), note: draft.note.trim(), hidden: draft.hidden && draft.type !== 'transfer' };
  if (draft.type === 'income') tx = { ...tx, person: draft.person, wallet: draft.wallet, category: draft.category, method: draft.method };
  else if (draft.type === 'expense') {
    tx = { ...tx, person: draft.person, scope: draft.scope, category: draft.category, method: draft.method, paidFrom: draft.scope === 'personal' ? draft.person : draft.paidFrom };
    if (draft.scope === 'shared') tx.shareMax = draft.shareMax;
  } else tx = { ...tx, from: draft.from, to: draft.to, fromMethod: draft.fromMethod, toMethod: draft.toMethod };
  const errs = validate(tx);
  if (errs.length) { error = errs[0]; render(); return; }
  if (draft.editId) store.update(draft.editId, tx); else store.add(tx);
  month = tx.date.slice(0, 7);
  draft = null; error = ''; tab = 'feed'; render(); window.scrollTo(0, 0);
}

// ---------- Рендер ----------
function renderNav() {
  const b = (t, i, l) => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">${ic(i)}<span>${l}</span></button>`;
  nav.innerHTML = `<div class="dock">${b('home', 'home', 'Мы')}${b('feed', 'list', 'Лента')}<button class="plus" data-tab="add" aria-label="Добавить операцию">${ic('plus')}</button>${b('stats', 'chart', 'Итоги')}${b('more', 'more', 'Ещё')}</div>`;
  nav.querySelectorAll('[data-tab]').forEach((el) => (el.onclick = () => { readForm(); tab = el.dataset.tab; if (tab === 'add' && draft && draft.editId) draft = null; if (tab !== 'add') error = ''; render(); window.scrollTo(0, 0); }));
}

function render() {
  const s = store.get();
  if (!s.viewer) return renderWho();
  if (tab === 'add' && !draft) draft = newDraft(s.viewer);
  renderNav();
  view.innerHTML = { home: renderHome, feed: renderFeed, stats: renderStats, add: renderAdd, more: renderMore }[tab](s);
  bind(s);
}

function bind(s) {
  view.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { month = shiftMonth(month, +b.dataset.m); render(); }));
  view.querySelectorAll('[data-chips]').forEach((box) => box.querySelectorAll('button').forEach((b) => (b.onclick = () => setChip(box.dataset.chips, b.dataset.v))));
  view.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => preset(b.dataset.preset)));
  view.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => {
    readForm();
    draft.shareMax = b.dataset.share === 'income' ? shareByIncome(inMonth(s.txs, draft.date.slice(0, 7))) : +b.dataset.share;
    const r = $('#f-share'); if (r) r.value = draft.shareMax;
    updatePreview();
  }));
  const share = $('#f-share'); if (share) share.oninput = updatePreview;
  const amt = $('#f-amount'); if (amt) amt.oninput = updatePreview;
  updatePreview();
  const sv = $('#f-save'); if (sv) sv.onclick = save;
  const cn = $('[data-cancel]'); if (cn) cn.onclick = () => { draft = null; tab = 'feed'; render(); };
  view.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => openSheet(r.dataset.id)));
  const sw = $('#switch') || $('[data-switch]'); if (sw) sw.onclick = () => { store.setViewer(other(s.viewer)); draft = null; };
  const ex = $('#export'); if (ex) ex.onclick = async () => { try { await navigator.clipboard.writeText(store.exportJson()); alert('Копия в буфере обмена. Вставьте её в заметки.'); } catch { prompt('Скопируйте текст:', store.exportJson()); } };
  const im = $('#import'); if (im) im.onclick = () => { const t = prompt('Вставьте резервную копию:'); if (!t) return; try { store.importJson(t); alert('Готово'); } catch { alert('Не получилось прочитать копию'); } };
  const rs = $('#reset'); if (rs) rs.onclick = () => { if (confirm('Удалить ВСЕ операции на этом телефоне?')) store.reset(); };
}

store.subscribe(render);
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
