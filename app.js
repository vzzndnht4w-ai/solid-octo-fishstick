// Роутер и оболочка приложения. Каждый экран — модуль в screens/: { render(s, a) → html, bind(root, s, a) }.
import { PEOPLE, WALLETS, applyProfiles } from './ledger.js';
import { store } from './store.js';
import { $, $$, esc, ic, av, nameOf, dayLabel, todayStr, shiftMonth, money as fm } from './core.js';
import home from './screens/home.js';
import feed, { txView } from './screens/feed.js';
import stats from './screens/stats.js';
import add, { startEdit, reset as resetDraft, isEditing } from './screens/add.js';
import more from './screens/more.js';
import settings from './screens/settings.js';
import budgets from './screens/budgets.js';
import goals from './screens/goals.js';
import recurring from './screens/recurring.js';
import data from './screens/data.js';
import profile from './screens/profile.js';
import onboarding from './screens/onboarding.js';
import { lockScreen, confirmPin, closePad } from './screens/lock.js';
import { applyTheme, applyAccents } from './lib/appearance.js';
import { shouldLock } from './lib/pin.js';
import './lib/profile-icons.js';
import { method as methodOf } from './ledger.js';
import { runRecurring } from './lib/recurring.js';

const SCREENS = { home, feed, stats, add, more, settings, budgets, goals, recurring, data, profile };
const TAB_OF = { settings: 'more', budgets: 'more', goals: 'more', recurring: 'more', data: 'more', profile: 'more' };
const view = $('#view'), nav = $('#tabs'), sheet = $('#sheet'), toastEl = $('#toast');

let route = 'home';
let month = todayStr().slice(0, 7);
let history = [];

// ---------- Профили, тема, блокировка ----------
const needLock = (s) => !!(s.viewer && s.settings.pins?.[s.viewer]);
let locked = needLock(store.get());   // при запуске PIN спрашивается всегда
let locking = false, hiddenAt = 0;
/** Имена, цвета и тема из сохранённых данных → ledger.js и CSS. Вызывается при старте и после каждого изменения. */
const applyAll = (s) => { applyProfiles(s.profiles); applyAccents(s.profiles); applyTheme(s.settings.theme); };
applyAll(store.get());

async function runLock() {
  if (locking) return;
  locking = true;
  const r = await lockScreen(store.get(), api);
  locking = false;
  if (r === 'cancelled') return render();
  locked = false;
  if (r === 'switched') { resetDraft(); route = 'home'; history = []; }
  render();
}
function lockNow() {
  if (!needLock(store.get())) return;
  closePad(); sheet.hidden = true; sheet.innerHTML = '';
  locked = true; render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const s = store.get();
  if (!locked && needLock(s) && shouldLock({ hiddenAt, now: Date.now(), autoLockMin: s.settings.autoLockMin })) lockNow();
  hiddenAt = 0;
});

/** Войти как другой человек; если у него есть PIN — сначала спрашиваем его. */
async function chooseUser(p, { cancelable = true } = {}) {
  const s = store.get();
  if (s.settings.pins?.[p] && (await confirmPin(p, { title: `PIN-код: ${nameOf(p)}`, sub: 'Чтобы войти под этим именем', cancelable })) !== true) return;
  locked = false; resetDraft(); route = 'home'; history = [];
  store.setViewer(p);
}

// ---------- API для экранов ----------
const api = {
  store,
  get route() { return route; },
  get month() { return month; },
  setMonth(m) { month = m; },
  today: todayStr,
  name: nameOf,
  render: () => render(),
  go(r, opts = {}) {
    if (r === 'add' && !opts.keepDraft && !isEditing()) resetDraft();
    if (!opts.back) history.push(route);
    route = r; render(); window.scrollTo(0, 0);
  },
  back() { route = history.pop() || 'more'; render(); window.scrollTo(0, 0); },
  editTx(t) { startEdit(t, store.get()); route = 'add'; render(); window.scrollTo(0, 0); },
  openTx: (id) => openSheet(id),
  toast,
  lock: lockNow,
};
window.__app = api; // для тестов и отладки

let toastTimer;
function toast(msg, action) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  toastEl.hidden = false;
  if (action) $('button', toastEl).onclick = () => { action.fn(); toastEl.hidden = true; };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.hidden = true), action ? 5000 : 2200);
}

// ---------- Шторка операции ----------
let confirmDel = false;
function openSheet(id) {
  const s = store.get(), t = s.txs.find((x) => x.id === id); if (!t) return;
  const v = txView(t, s.viewer), mine = !t.hidden || t.person === s.viewer;
  const kv = (k, val) => `<div class="row"><span class="muted">${k}</span><b>${val}</b></div>`;
  const mname = (m) => (m === 'cash' ? 'Наличные' : 'Карта');
  let rows = kv('Дата', `${dayLabel(t.date)}, ${t.date.slice(8)}.${t.date.slice(5, 7)}.${t.date.slice(0, 4)}`);
  if (t.type === 'expense') rows += kv('Кто', esc(nameOf(t.person))) + kv('Тип', t.scope === 'personal' ? 'Личная' : `Общая, ${t.shareMax}/${100 - t.shareMax}`) + kv('Откуда', esc(WALLETS[t.paidFrom])) + kv('Способ', mname(methodOf(t)));
  if (t.type === 'income') rows += kv('Кто', esc(nameOf(t.person))) + kv('Куда', esc(WALLETS[t.wallet])) + kv('Способ', mname(methodOf(t)));
  if (t.type === 'transfer') rows += kv('Откуда', esc(WALLETS[t.from])) + kv('Куда', esc(WALLETS[t.to]));
  if (t.note && mine) rows += kv('Заметка', esc(t.note));
  sheet.hidden = false;
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="row" style="justify-content:flex-start;gap:12px">${v.icon}<div><b style="font-size:18px">${esc(v.title)}</b></div></div>
    <div class="big ${v.cls}" style="margin-top:12px">${v.amt}</div><div class="kvs">${rows}</div>
    <div class="btns">${confirmDel ? `<button data-sheet="cancel">Не удалять</button><button class="del" data-sheet="del2">Да, удалить</button>` : `<button data-sheet="edit" ${mine ? '' : 'disabled style="opacity:.4"'}>Изменить</button><button class="del" data-sheet="del">Удалить</button>`}</div></div>`;
  const close = () => { sheet.hidden = true; sheet.innerHTML = ''; confirmDel = false; };
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  $$('[data-sheet]', sheet).forEach((b) => (b.onclick = () => {
    const act = b.dataset.sheet;
    if (act === 'edit') { close(); api.editTx(t); }
    else if (act === 'del') { confirmDel = true; openSheet(id); }
    else if (act === 'cancel') { confirmDel = false; openSheet(id); }
    else if (act === 'del2') { close(); store.remove(id); toast('Операция удалена', { label: 'Отменить', fn: () => store.restore(t) }); }
  }));
}

// ---------- Знакомство и выбор пользователя ----------
function renderWho() {
  nav.innerHTML = '';
  const s = store.get();
  view.innerHTML = `<div class="stack" style="padding-top:12vh;text-align:center">
    <div class="empty" style="padding-bottom:0"><div class="big">${ic('users')}</div><h1>Мы</h1><p class="muted">Деньги вдвоём: у каждого своё, и общее тоже.<br>Кто сейчас с телефоном?</p></div>
    <button class="primary" data-who="max" style="background:linear-gradient(135deg,var(--max),var(--max2))">Я — ${esc(s.profiles.max.name)}</button>
    <button class="primary" data-who="dinara" style="margin-top:0;background:linear-gradient(135deg,var(--dinara),var(--dinara2))">Я — ${esc(s.profiles.dinara.name)}</button></div>`;
  $$('[data-who]', view).forEach((b) => (b.onclick = () => chooseUser(b.dataset.who)));
}

// ---------- Рендер ----------
function renderNav() {
  const tab = TAB_OF[route] || route;
  const b = (t, i, l) => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}" ${tab === t ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></button>`;
  nav.innerHTML = `<div class="dock">${b('home', 'home', 'Мы')}${b('feed', 'list', 'Лента')}<button class="plus" data-tab="add" aria-label="Добавить операцию">${ic('plus')}</button>${b('stats', 'chart', 'Итоги')}${b('more', 'more', 'Ещё')}</div>`;
  $$('[data-tab]', nav).forEach((el) => (el.onclick = () => { history = []; api.go(el.dataset.tab); }));
}

function render() {
  const s = store.get();
  const fk = document.activeElement?.dataset?.fk;   // чтобы фокус не терялся при перерисовке
  if (!s.settings.onboarded) {
    nav.innerHTML = ''; view.innerHTML = onboarding.render(s, api); onboarding.bind(view, s, api);
    return restoreFocus(fk);
  }
  if (locked && !needLock(s)) locked = false;
  if (locked) { nav.innerHTML = ''; view.innerHTML = ''; runLock(); return; }
  if (!s.viewer) return renderWho();
  const screen = SCREENS[route] || SCREENS.home;
  renderNav();
  view.innerHTML = screen.render(s, api);
  $$('[data-m]', view).forEach((b) => (b.onclick = () => { month = shiftMonth(month, +b.dataset.m); render(); }));
  $$('[data-back]', view).forEach((b) => (b.onclick = () => api.back()));
  $$('[data-switch]', view).forEach((b) => (b.onclick = () => chooseUser(s.viewer === 'max' ? 'dinara' : 'max')));
  screen.bind(view, s, api);
  restoreFocus(fk);
}
function restoreFocus(fk) {
  if (!fk) return;
  const el = [...document.querySelectorAll('[data-fk]')].find((e) => e.dataset.fk === fk);
  if (el && !el.disabled) el.focus({ preventScroll: true });
}

store.subscribe(() => { applyAll(store.get()); render(); });
render();
// Регулярные платежи: проводим пропущенное при запуске и при возвращении в приложение.
const runRec = () => { const n = runRecurring(store, todayStr()); if (n) toast(`Добавлено регулярных платежей: ${n}`); };
runRec();
document.addEventListener('visibilitychange', () => { if (!document.hidden) runRec(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
