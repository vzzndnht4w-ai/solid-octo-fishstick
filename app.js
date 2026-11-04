import { PEOPLE, WALLETS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, other, balances, debt, stats, splitAmount, shareByIncome, inMonth, validate, formatMoney as fm, parseMoney } from './ledger.js';
import { store } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const monthLabel = (ym) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
const shiftMonth = (ym, d) => { const t = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + d, 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; };
const CAT_ICON = { 'Продукты': '🛒', 'Еда вне дома': '🍽️', 'Транспорт': '🚇', 'Машина': '🚗', 'Жильё': '🏠', 'Здоровье': '💊', 'Развлечения': '🎬', 'Одежда': '👕', 'Подарки': '🎁', 'Путешествия': '✈️', 'Зарплата': '💼', 'Подработка': '🧰', 'Другое': '📦' };

let tab = 'home';
let month = todayStr().slice(0, 7);
let draft = null;
let error = '';

const newDraft = (viewer) => ({ type: 'expense', amount: '', person: viewer, category: EXPENSE_CATEGORIES[0], scope: 'shared', paidFrom: viewer, shareMax: 50, note: '', hidden: false, wallet: viewer, from: viewer, to: 'joint', date: todayStr() });

const nameOf = (p) => PEOPLE[p];
const dotPill = (p, text) => `<span class="pill ${p}" style="--c:var(--${p})">${esc(text ?? nameOf(p))}</span>`;

// ---------- Экраны ----------
function renderWho() {
  view.innerHTML = `<h1>Привет! 👋</h1><p class="muted">Кто сейчас пользуется телефоном?</p>
  <div class="grid2"><button class="primary" data-who="max" style="background:var(--max)">Я — Максим</button><button class="primary" data-who="dinara" style="background:var(--dinara)">Я — Динара</button></div>`;
  view.querySelectorAll('[data-who]').forEach((b) => (b.onclick = () => { store.setViewer(b.dataset.who); draft = null; }));
  $('#tabs').style.display = 'none';
}

function renderHome(s) {
  const all = s.txs, b = balances(all), d = debt(all);
  const ms = stats(inMonth(all, month));
  const debtText = d === 0 ? 'Вы квиты 🤝' : d > 0 ? `Динара должна Максиму <b>${fm(d)}</b>` : `Максим должен Динаре <b>${fm(-d)}</b>`;
  const person = (p) => `<div class="card ${p}" style="--c:var(--${p})"><div class="muted"><span class="dot" style="background:var(--c)"></span>${nameOf(p)}</div>
    <div class="row"><span class="muted">Заработал${p === 'dinara' ? 'а' : ''}</span><b class="pos">${fm(ms[p].earned)}</b></div>
    <div class="row"><span class="muted">Личные траты</span><b>${fm(ms[p].personal)}</b></div>
    <div class="row"><span class="muted">Доля общих</span><b>${fm(ms[p].sharedShare)}</b></div>
    <div class="row"><span class="muted">В котёл</span><b>${fm(ms[p].toJoint)}</b></div>
    <div class="row"><span class="muted">Кошелёк</span><b>${fm(b[p])}</b></div></div>`;
  return `<div class="month"><button data-m="-1">‹</button><b>${monthLabel(month)}</b><button data-m="1">›</button></div>
  <div class="card joint" style="--c:var(--joint)"><div class="muted">🏦 Общий котёл</div><div class="big">${fm(b.joint)}</div>
    <div class="muted">Меняется только когда платите из него или пополняете</div></div>
  <div class="card"><div class="muted">Кто кому должен</div><div style="font-size:18px;margin-top:4px">${debtText}</div></div>
  <h2>За ${monthLabel(month).toLowerCase()}</h2><div class="grid2">${person('max')}${person('dinara')}</div>`;
}

function txRow(t, viewer) {
  const secret = t.hidden && t.person !== viewer;
  let icon, title, sub, amt, cls = '';
  if (t.type === 'transfer') {
    icon = '🔁'; title = `${WALLETS[t.from]} → ${WALLETS[t.to]}`;
    const settle = (t.from === 'max' && t.to === 'dinara') || (t.from === 'dinara' && t.to === 'max');
    sub = settle ? 'Взаиморасчёт' : 'Перевод'; amt = fm(t.amount);
  } else if (t.type === 'income') {
    icon = secret ? '🔒' : CAT_ICON[t.category] || '💰'; title = secret ? 'Скрыто' : t.category; sub = `${dotPill(t.person)} → ${WALLETS[t.wallet]}`; amt = '+' + fm(t.amount); cls = 'pos';
  } else {
    icon = secret ? '🔒' : CAT_ICON[t.category] || '📦'; title = secret ? 'Скрыто' : t.category;
    sub = t.scope === 'personal' ? `${dotPill(t.person)} личное` : `${dotPill('joint', 'Общее')} ${100 - t.shareMax === 0 ? '' : `${t.shareMax}/${100 - t.shareMax}`} · платил${t.paidFrom === 'dinara' ? 'а' : ''}: ${t.paidFrom === 'joint' ? 'котёл' : nameOf(t.paidFrom)}`;
    amt = '−' + fm(t.amount);
  }
  const note = !secret && t.note ? `<div class="muted">${esc(t.note)}</div>` : '';
  return `<div class="row" data-id="${t.id}"><div style="display:flex;gap:10px;align-items:center;min-width:0"><span style="font-size:24px">${icon}</span><div style="min-width:0"><div>${esc(title)}</div><div class="muted">${sub}</div>${note}</div></div><b class="${cls}">${amt}</b></div>`;
}

function renderFeed(s) {
  const list = inMonth(s.txs, month).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  let html = `<div class="month"><button data-m="-1">‹</button><b>${monthLabel(month)}</b><button data-m="1">›</button></div>`;
  if (!list.length) return html + `<div class="empty">Операций пока нет.<br>Нажмите + чтобы добавить.</div>`;
  let cur = '';
  for (const t of list) {
    if (t.date !== cur) { cur = t.date; html += `<h2>${cur.slice(8)}.${cur.slice(5, 7)}</h2>`; }
    html += `<div class="card" style="padding:4px 16px">${txRow(t, s.viewer)}</div>`;
  }
  return html + `<p class="muted" style="text-align:center">Нажмите на операцию, чтобы удалить</p>`;
}

function renderStats(s) {
  const txs = inMonth(s.txs, month), st = stats(txs);
  const bar = (a, b) => { const t = a + b || 1; return `<div class="bar"><i style="width:${(a / t) * 100}%;background:var(--max)"></i><i style="width:${(b / t) * 100}%;background:var(--dinara)"></i></div>`; };
  const cmp = (label, k) => `<div class="card"><div class="row" style="border:0"><span>${label}</span></div>
    <div class="row" style="border:0;padding:0"><span class="muted"><span class="dot" style="background:var(--max)"></span>${fm(st.max[k])}</span><span class="muted">${fm(st.dinara[k])}<span class="dot" style="background:var(--dinara);margin:0 0 0 6px"></span></span></div>${bar(st.max[k], st.dinara[k])}</div>`;
  const byCat = {};
  for (const t of txs) if (t.type === 'expense' && (t.scope === 'shared' || t.person === s.viewer)) { const k = t.scope === 'shared' ? 'Общее · ' + t.category : 'Моё · ' + t.category; byCat[k] = (byCat[k] || 0) + t.amount; }
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = cats.reduce((a, [, v]) => a + v, 0) || 1;
  return `<div class="month"><button data-m="-1">‹</button><b>${monthLabel(month)}</b><button data-m="1">›</button></div>
  ${cmp('Заработали', 'earned')}${cmp('Личные траты', 'personal')}${cmp('Доля в общих тратах', 'sharedShare')}
  <h2>Куда уходят деньги (общее + ваше личное)</h2><div class="card">${cats.length ? cats.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span><b>${fm(v)}</b> <span class="muted">${Math.round((v / total) * 100)}%</span></span></div>`).join('') : '<div class="muted">Нет данных</div>'}</div>`;
}

function chips(name, items, cur) { return `<div class="chips" data-chips="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
const personOpts = Object.entries(PEOPLE);
const walletOpts = Object.entries(WALLETS);

function renderAdd(s) {
  const dr = draft;
  const types = [['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']];
  let h = `<h1>Новая операция</h1><div class="seg" data-chips="type">${types.map(([v, l]) => `<button type="button" data-v="${v}" class="${dr.type === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="card"><input class="amount" id="f-amount" inputmode="decimal" placeholder="0 ₽" value="${esc(dr.amount)}"></div>`;
  if (dr.type !== 'transfer') h += `<label>Кто</label>${chips('person', personOpts, dr.person)}`;
  if (dr.type === 'expense') {
    h += `<label>Категория</label><select id="f-category">${EXPENSE_CATEGORIES.map((c) => `<option ${c === dr.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label>Тип траты</label>${chips('scope', [['personal', '👤 Личное'], ['shared', '👥 Общее']], dr.scope)}`;
    if (dr.scope === 'personal') h += `<p class="muted">Спишется с кошелька: ${esc(WALLETS[dr.person])}. На общий баланс и долги не влияет.</p>`;
    else {
      h += `<label>Откуда заплатили</label>${chips('paidFrom', walletOpts, dr.paidFrom)}
      <label id="f-sharelabel"></label>
      <input type="range" id="f-share" min="0" max="100" step="5" value="${dr.shareMax}">
      <div class="chips" style="margin-top:8px"><button type="button" data-share="50">50/50</button><button type="button" data-share="60">60/40</button><button type="button" data-share="70">70/30</button><button type="button" data-share="income">По доходам</button></div>
      <p class="muted" id="f-preview"></p>`;
    }
  } else if (dr.type === 'income') {
    h += `<label>Категория</label><select id="f-category">${INCOME_CATEGORIES.map((c) => `<option ${c === dr.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label>Куда пришли деньги</label>${chips('wallet', walletOpts, dr.wallet)}`;
  } else {
    h += `<label>Откуда</label>${chips('from', walletOpts, dr.from)}<label>Куда</label>${chips('to', walletOpts, dr.to)}
    <p class="muted">Перевод в «Общий котёл» — это пополнение, а не расход. Перевод между вашими кошельками считается взаиморасчётом и гасит долг.</p>`;
  }
  h += `<label>Дата</label><input type="date" id="f-date" value="${dr.date}"><label>Заметка</label><input id="f-note" placeholder="Необязательно" value="${esc(dr.note)}">`;
  if (dr.type !== 'transfer') h += `<label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="f-hidden" style="width:auto" ${dr.hidden ? 'checked' : ''}> Скрыть детали от партнёра (будет видна только сумма)</label>`;
  h += `${error ? `<div class="error">${esc(error)}</div>` : ''}<button class="primary" id="f-save">Сохранить</button>`;
  return h;
}

function renderMore(s) {
  return `<h1>Ещё</h1><div class="card"><div class="row"><span>Вы</span><b>${nameOf(s.viewer)}</b></div>
  <div class="row"><button class="ghost" id="switch">Сменить пользователя</button></div></div>
  <h2>Данные</h2><div class="card"><div class="row"><span>Операций</span><b>${s.txs.length}</b></div>
  <div class="row"><button class="ghost" id="export">Скопировать резервную копию</button></div>
  <div class="row"><button class="ghost" id="import">Восстановить из копии</button></div>
  <div class="row"><button class="ghost danger" id="reset">Удалить все операции</button></div></div>
  <p class="muted">Версия 0.1. Пока данные хранятся только на этом телефоне; синхронизация между вами — следующий шаг.</p>`;
}

// ---------- Работа формы ----------
function readForm() {
  if (!draft) return;
  const g = (id) => $('#' + id);
  if (g('f-amount')) draft.amount = g('f-amount').value;
  if (g('f-category')) draft.category = g('f-category').value;
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
  lab.textContent = `Как делим: Максим ${draft.shareMax}% / Динара ${100 - draft.shareMax}%`;
  const debtor = other(pf), word = debtor === 'max' ? 'будет должен' : 'будет должна';
  pv.innerHTML = `Максим: ${fm(sp.max)} · Динара: ${fm(sp.dinara)}<br>` + (pf === 'joint' ? 'Платим из котла — долгов не возникает.' : `Платил${pf === 'dinara' ? 'а' : ''} ${nameOf(pf)} — ${nameOf(debtor)} ${word} свою долю. Котёл не меняется.`);
}

function setChip(name, v) {
  readForm(); error = '';
  if (name === 'type') {
    draft.type = v;
    draft.category = v === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
  } else if (name === 'person') {
    draft.person = v; draft.wallet = v; draft.paidFrom = v; draft.from = v;
  } else draft[name] = v;
  if (name === 'scope' && v === 'personal') draft.paidFrom = draft.person;
  if (name === 'scope' && v === 'shared') draft.paidFrom = draft.person;
  render();
}

function save() {
  readForm();
  const amount = parseMoney(draft.amount);
  let tx = { type: draft.type, amount, date: draft.date || todayStr(), note: draft.note.trim(), hidden: draft.hidden && draft.type !== 'transfer' };
  if (draft.type === 'income') tx = { ...tx, person: draft.person, wallet: draft.wallet, category: draft.category };
  else if (draft.type === 'expense') {
    tx = { ...tx, person: draft.person, scope: draft.scope, category: draft.category, paidFrom: draft.scope === 'personal' ? draft.person : draft.paidFrom };
    if (draft.scope === 'shared') tx.shareMax = draft.shareMax;
  } else tx = { ...tx, from: draft.from, to: draft.to };
  const errs = validate(tx);
  if (errs.length) { error = errs[0]; render(); return; }
  store.add(tx);
  month = tx.date.slice(0, 7);
  draft = null; error = ''; tab = 'feed'; render();
}

// ---------- Рендер ----------
function render() {
  const s = store.get();
  if (!s.viewer) return renderWho();
  $('#tabs').style.display = '';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'add' && !draft) draft = newDraft(s.viewer);
  view.innerHTML = { home: renderHome, feed: renderFeed, stats: renderStats, add: renderAdd, more: renderMore }[tab](s);
  bind(s);
}

function bind(s) {
  view.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { month = shiftMonth(month, +b.dataset.m); render(); }));
  view.querySelectorAll('[data-chips]').forEach((box) => box.querySelectorAll('button').forEach((b) => (b.onclick = () => setChip(box.dataset.chips, b.dataset.v))));
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
  view.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => { if (confirm('Удалить эту операцию?')) store.remove(r.dataset.id); }));
  const sw = $('#switch'); if (sw) sw.onclick = () => { store.setViewer(other(s.viewer)); draft = null; };
  const ex = $('#export'); if (ex) ex.onclick = async () => { try { await navigator.clipboard.writeText(store.exportJson()); alert('Копия в буфере обмена. Вставьте её в заметки.'); } catch { prompt('Скопируйте текст:', store.exportJson()); } };
  const im = $('#import'); if (im) im.onclick = () => { const t = prompt('Вставьте резервную копию:'); if (!t) return; try { store.importJson(t); alert('Готово'); } catch { alert('Не получилось прочитать копию'); } };
  const rs = $('#reset'); if (rs) rs.onclick = () => { if (confirm('Удалить ВСЕ операции на этом телефоне?')) store.reset(); };
}

document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => { readForm(); tab = b.dataset.tab; if (tab !== 'add') error = ''; render(); window.scrollTo(0, 0); }));
store.subscribe(render);
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
