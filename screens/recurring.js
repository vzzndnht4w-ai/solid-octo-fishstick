import { WALLETS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, validate, parseMoney } from '../ledger.js';
import { ic, esc, tile, nameOf, money as fm, subHeader, catOf, $, $$ } from '../core.js';
import { openSheet, chips, personChips, bindChips, amountField, kopToInput } from '../planui.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const TYPES = [['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']];
const walletChips = (name, cur) => chips(name, Object.entries(WALLETS).map(([w, l]) => [w, esc(l)]), cur, (v) => v);
const methodChips = (name, cur) => chips(name, [['card', `${ic('card')} Карта`], ['cash', `${ic('cash')} Наличные`]], cur);
const catGrid = (list, cur) => `<div class="cats" data-chips="category">${list.map((c) => { const [i, h] = catOf(c); return `<button type="button" data-v="${esc(c)}" class="catb ${cur === c ? 'on' : ''}" style="--h:${h}"><span class="tile" style="--h:${h}">${ic(i)}</span>${esc(c)}</button>`; }).join('')}</div>`;
const ordinal = (d) => `${d}-го числа`;

const titleOf = (t) => t.note || (t.type === 'transfer' ? 'Перевод' : t.category);
function iconOf(t) {
  if (t.type === 'transfer') return `<span class="tile" style="--h:#7b6cf0">${ic('swap')}</span>`;
  return tile(t.category);
}

function form(rec, s, a) {
  const isNew = !rec, t = rec?.tpl || {};
  const p0 = t.person || t.from || s.viewer;
  const f = {
    type: t.type || 'expense', amount: kopToInput(t.amount), category: t.category || EXPENSE_CATEGORIES[0], scope: t.scope || 'shared', person: p0,
    paidFrom: t.paidFrom || 'joint', method: t.method || t.fromMethod || s.settings.defaultMethod || 'card', shareMax: t.shareMax ?? s.settings.defaultShare ?? 50,
    wallet: t.wallet || p0, from: t.from || p0, to: t.to || 'joint', fromMethod: t.fromMethod || 'card', toMethod: t.toMethod || 'card',
    note: t.note || '', hidden: !!t.hidden, day: rec?.day || +a.today().slice(8), start: a.today(),
  };
  if (f.day > 28) f.day = 28;
  let err = '', confirm = false;
  const sh = openSheet('');
  const cats = (kind, base) => [...base, ...(s.categories[kind] || [])];
  const draw = () => {
    let h = `<div class="grab"></div><h1 style="font-size:22px">${isNew ? 'Новый регулярный платёж' : 'Регулярный платёж'}</h1><div style="height:14px"></div>
      <div class="seg" data-chips="type">${TYPES.map(([v, l]) => `<button type="button" data-v="${v}" class="${f.type === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div style="height:12px"></div>${amountField('r-amount', f.amount, s.settings.currency)}
      <label class="l">Название</label><input id="r-note" placeholder="${f.type === 'income' ? 'Например, Зарплата' : 'Например, Аренда'}" maxlength="40" value="${esc(f.note)}">`;
    if (f.type !== 'transfer') h += `<label class="l">Кто</label>${personChips('person', f.person)}`;
    if (f.type === 'expense') {
      h += `<label class="l">Категория</label>${catGrid(cats('expense', EXPENSE_CATEGORIES), f.category)}
        <label class="l">Чья это трата</label><div class="opts" data-chips="scope">
        <button type="button" data-v="personal" class="opt ${f.scope === 'personal' ? 'on' : ''}"><b>${ic('user')} Личная</b><small>Только ${esc(nameOf(f.person))}</small></button>
        <button type="button" data-v="shared" class="opt ${f.scope === 'shared' ? 'on' : ''}"><b>${ic('users')} Общая</b><small>Делим на двоих</small></button></div>
        <label class="l">Чем платим</label>${methodChips('method', f.method)}`;
      if (f.scope === 'shared') h += `<label class="l">Откуда деньги</label>${walletChips('paidFrom', f.paidFrom)}
        <label class="l">Доля: ${esc(nameOf('max'))} ${f.shareMax}% · ${esc(nameOf('dinara'))} ${100 - f.shareMax}%</label><input type="range" id="r-share" min="0" max="100" step="5" value="${f.shareMax}" aria-label="Доля первого человека">`;
    } else if (f.type === 'income') {
      h += `<label class="l">Категория</label>${catGrid(cats('income', INCOME_CATEGORIES), f.category)}
        <label class="l">Куда приходят деньги</label>${walletChips('wallet', f.wallet)}<label class="l">Способ</label>${methodChips('method', f.method)}`;
    } else {
      h += `<label class="l">Откуда</label>${walletChips('from', f.from)}<div style="height:8px"></div>${methodChips('fromMethod', f.fromMethod)}
        <label class="l">Куда</label>${walletChips('to', f.to)}<div style="height:8px"></div>${methodChips('toMethod', f.toMethod)}`;
    }
    h += `<label class="l">День месяца (1–28)</label><div class="daypick"><button type="button" class="back" data-day="-1" aria-label="Раньше">${ic('left')}</button><input id="r-day" inputmode="numeric" value="${f.day}" aria-label="День месяца"><button type="button" class="back" data-day="1" aria-label="Позже">${ic('right')}</button></div>`;
    if (isNew) h += `<label class="l">Первое списание не раньше</label><input type="date" id="r-start" value="${esc(f.start)}"><div class="muted sm" style="margin:6px 4px 0">Укажите прошлую дату, чтобы добавить пропущенные месяцы (до 12).</div>`;
    if (f.type !== 'transfer') h += `<label class="switch"><span>Скрыть детали от партнёра<br><span class="muted sm">Будет видна только сумма</span></span><input type="checkbox" id="r-hidden" ${f.hidden ? 'checked' : ''}></label>`;
    h += `${err ? `<div class="error">${esc(err)}</div>` : ''}<button class="primary" id="r-save">${isNew ? 'Добавить' : 'Сохранить'}</button>`;
    if (!isNew) {
      h += `<button class="ghost" id="r-toggle" style="margin-top:10px;text-align:center">${ic(rec.active === false ? 'play' : 'pause')} ${rec.active === false ? 'Возобновить' : 'Поставить на паузу'}</button>`;
      h += confirm
        ? `<div class="preview">Платёж удалится, уже добавленные операции останутся в ленте.</div><div class="btns2"><button class="ghost" id="r-keep" style="text-align:center">Не удалять</button><button class="ghost danger" id="r-del2" style="text-align:center">Да, удалить</button></div>`
        : `<button class="ghost danger" id="r-del" style="margin-top:10px;text-align:center">Удалить</button>`;
    }
    sh.el.innerHTML = h;
    const g = (id) => $('#' + id, sh.el);
    const read = () => {
      if (g('r-amount')) f.amount = g('r-amount').value;
      if (g('r-note')) f.note = g('r-note').value;
      if (g('r-day')) f.day = Math.min(28, Math.max(1, parseInt(g('r-day').value, 10) || 1));
      if (g('r-start')) f.start = g('r-start').value;
      if (g('r-hidden')) f.hidden = g('r-hidden').checked;
      if (g('r-share')) f.shareMax = +g('r-share').value;
    };
    bindChips(sh.el, (name, v) => {
      read(); err = ''; f[name] = v;
      if (name === 'type') f.category = v === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
      if (name === 'person') { f.wallet = v; f.from = v; if (f.paidFrom !== 'joint') f.paidFrom = v; }
      draw();
    });
    $$('[data-day]', sh.el).forEach((b) => (b.onclick = () => { read(); f.day = Math.min(28, Math.max(1, f.day + +b.dataset.day)); g('r-day').value = f.day; }));
    const sr = g('r-share'); if (sr) sr.oninput = () => { sr.previousElementSibling.textContent = `Доля: ${nameOf('max')} ${sr.value}% · ${nameOf('dinara')} ${100 - sr.value}%`; };
    g('r-save').onclick = () => {
      read();
      const base = { amount: parseMoney(f.amount), note: f.note.trim(), hidden: f.hidden && f.type !== 'transfer' };
      let tpl;
      if (f.type === 'income') tpl = { type: 'income', ...base, person: f.person, wallet: f.wallet, category: f.category, method: f.method };
      else if (f.type === 'expense') {
        tpl = { type: 'expense', ...base, person: f.person, scope: f.scope, category: f.category, method: f.method, paidFrom: f.scope === 'personal' ? f.person : f.paidFrom };
        if (f.scope === 'shared') tpl.shareMax = f.shareMax;
      } else tpl = { type: 'transfer', ...base, from: f.from, to: f.to, fromMethod: f.fromMethod, toMethod: f.toMethod };
      const errs = validate(tpl);
      if (errs.length) { err = errs[0]; draw(); return; }
      const item = isNew ? { id: uid(), tpl, day: f.day, lastRun: null, active: true, createdAt: f.start || a.today() } : { ...rec, tpl, day: f.day };
      sh.close();
      a.store.mutate((st) => { st.recurring = isNew ? [...st.recurring, item] : st.recurring.map((x) => (x.id === item.id ? item : x)); });
    };
    const tg = g('r-toggle'); if (tg) tg.onclick = () => { sh.close(); a.store.mutate((st) => { st.recurring = st.recurring.map((x) => (x.id === rec.id ? { ...x, active: x.active === false } : x)); }); };
    const d = g('r-del'); if (d) d.onclick = () => { read(); confirm = true; draw(); };
    const k = g('r-keep'); if (k) k.onclick = () => { read(); confirm = false; draw(); };
    const d2 = g('r-del2'); if (d2) d2.onclick = () => { sh.close(); a.store.mutate((st) => { st.recurring = st.recurring.filter((x) => x.id !== rec.id); }); };
  };
  draw();
}

export default {
  render(s, a) {
    let h = subHeader('Регулярные платежи') + `<button class="primary addbtn" data-new>${ic('plus')} Новый платёж</button>`;
    if (!s.recurring.length) return h + `<div class="empty card" style="margin-top:16px"><div class="big">${ic('repeat')}</div><b>Всё само</b><span class="muted">Аренда, подписки, зарплата — добавьте один раз, и операции будут появляться каждый месяц в нужный день</span></div>`;
    const act = s.recurring.filter((r) => r.active !== false);
    const out = act.filter((r) => r.tpl.type === 'expense').reduce((n, r) => n + r.tpl.amount, 0), inc = act.filter((r) => r.tpl.type === 'income').reduce((n, r) => n + r.tpl.amount, 0);
    h += `<div class="card rsum"><div><div class="muted sm">Расходы в месяц</div><b>${fm(out)}</b></div><div><div class="muted sm">Доходы в месяц</div><b class="pos">${fm(inc)}</b></div></div><div class="list" style="margin-top:16px">`;
    for (const r of [...s.recurring].sort((x, y) => x.day - y.day)) {
      const t = r.tpl, paused = r.active === false;
      const who = t.type === 'transfer' ? '' : t.scope === 'shared' ? '<span class="tag joint">Общее</span>' : `<span class="tag ${t.person}">${esc(nameOf(t.person))}</span>`;
      const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
      h += `<button class="tx rec ${paused ? 'paused' : ''}" data-id="${esc(r.id)}">${iconOf(t)}<div class="mid"><b>${esc(titleOf(t))}</b><div class="sub">${who}<span>${ordinal(r.day)}</span>${paused ? '<span class="tag">Пауза</span>' : ''}</div></div><span class="amt ${t.type === 'income' ? 'pos' : ''}">${sign}${fm(t.amount)}</span></button>`;
    }
    return h + '</div>';
  },
  bind(root, s, a) {
    $('[data-new]', root).onclick = () => form(null, s, a);
    $$('[data-id]', root).forEach((b) => (b.onclick = () => form(s.recurring.find((r) => r.id === b.dataset.id), s, a)));
  },
};
