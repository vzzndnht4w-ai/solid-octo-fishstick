import { WALLETS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, other, splitAmount, shareByIncome, inMonth, validate, method as methodOf, parseMoney } from '../ledger.js';
import { ic, av, esc, nameOf, feminine, catOf, money as fm, todayStr, $, $$ } from '../core.js';

let draft = null, error = '';

const newDraft = (s) => ({ editId: null, type: 'expense', amount: '', person: s.viewer, category: EXPENSE_CATEGORIES[0], scope: 'shared', paidFrom: s.viewer, method: s.settings.defaultMethod || 'card', shareMax: s.settings.defaultShare ?? 50, note: '', hidden: false, wallet: s.viewer, from: s.viewer, fromMethod: 'card', to: 'joint', toMethod: 'card', date: todayStr() });
const draftFrom = (t, s) => ({ ...newDraft(s), ...t, editId: t.id, person: t.person || t.from || s.viewer, amount: String(t.amount / 100).replace('.', ','), method: methodOf(t), fromMethod: methodOf(t, 'from'), toMethod: methodOf(t, 'to'), note: t.note || '', hidden: !!t.hidden });

export const startEdit = (t, s) => { draft = draftFrom(t, s); error = ''; };
export const reset = () => { draft = null; error = ''; };
export const isEditing = () => !!(draft && draft.editId);
/** Открыть форму с заготовкой (например, из шаблона регулярного платежа). */
export const startWith = (partial, s) => { draft = { ...newDraft(s), ...partial }; error = ''; };

const chips = (name, items, cur, cls = () => '') => `<div class="chips" data-chips="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="chip ${cls(v)} ${String(cur) === String(v) ? 'on' : ''}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
const personChips = (name, cur) => chips(name, ['max', 'dinara'].map((p) => [p, `${av(p, 'sm')}${esc(nameOf(p))}`]), cur, (v) => v);
const walletChips = (name, cur) => chips(name, Object.entries(WALLETS).map(([w, l]) => [w, esc(l)]), cur, (v) => v);
const methodChips = (name, cur) => chips(name, [['card', `${ic('card')} Карта`], ['cash', `${ic('cash')} Наличные`]], cur);
const catGrid = (list, cur) => `<div class="cats" data-chips="category">${list.map((c) => { const [i, h] = catOf(c); return `<button type="button" data-v="${esc(c)}" class="catb ${cur === c ? 'on' : ''}" aria-pressed="${cur === c}" style="--h:${h}"><span class="tile" style="--h:${h}">${ic(i)}</span>${esc(c)}</button>`; }).join('')}</div>`;

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
  lab.textContent = `Как делим: ${nameOf('max')} ${draft.shareMax}% · ${nameOf('dinara')} ${100 - draft.shareMax}%`;
  const debtor = other(pf);
  pv.innerHTML = `${esc(nameOf('max'))}: <b>${fm(sp.max)}</b> · ${esc(nameOf('dinara'))}: <b>${fm(sp.dinara)}</b><br>` + (pf === 'joint' ? 'Платим из котла — долгов не возникает.' : `Платил${feminine(pf)} ${esc(nameOf(pf))}: ${esc(nameOf(debtor))} ${feminine(debtor) ? 'будет должна' : 'будет должен'} свою долю. Котёл не меняется.`);
}

export default {
  render(s) {
    if (!draft) draft = newDraft(s);
    const dr = draft;
    const cats = (kind, base) => [...base, ...(s.categories[kind] || [])];
    let h = `<div class="top"><h1>${dr.editId ? 'Изменить' : 'Новая операция'}</h1>${dr.editId ? `<button class="av joint" data-cancel aria-label="Отмена">${ic('x')}</button>` : ''}</div>
    <div class="seg" data-chips="type">${[['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']].map(([v, l]) => `<button type="button" data-v="${v}" class="${dr.type === v ? 'on' : ''}" aria-pressed="${dr.type === v}">${l}</button>`).join('')}</div>
    <div class="card amount" style="margin-top:12px"><input id="f-amount" inputmode="decimal" placeholder="0" value="${esc(dr.amount)}" aria-label="Сумма"><span>${esc(s.settings.currency)}</span></div>`;
    if (dr.type !== 'transfer') h += `<label class="l">Кто</label>${personChips('person', dr.person)}`;
    if (dr.type === 'expense') {
      h += `<label class="l">Категория</label>${catGrid(cats('expense', EXPENSE_CATEGORIES), dr.category)}
      <label class="l">Чья это трата</label><div class="opts" data-chips="scope">
        <button type="button" data-v="personal" class="opt ${dr.scope === 'personal' ? 'on' : ''}" aria-pressed="${dr.scope === 'personal'}"><b>${ic('user')} Личная</b><small>Только ${esc(nameOf(dr.person))}. Общий баланс и долги не меняются.</small></button>
        <button type="button" data-v="shared" class="opt ${dr.scope === 'shared' ? 'on' : ''}" aria-pressed="${dr.scope === 'shared'}"><b>${ic('users')} Общая</b><small>Делим на двоих в нужной пропорции.</small></button></div>
      <label class="l">Чем заплатили</label>${methodChips('method', dr.method)}`;
      if (dr.scope === 'personal') h += `<div class="preview">Спишется из «${esc(WALLETS[dr.person])}». Общий котёл не затрагивается.</div>`;
      else h += `<label class="l">Откуда деньги</label>${walletChips('paidFrom', dr.paidFrom)}
        <label class="l" id="f-sharelabel" for="f-share"></label><input type="range" id="f-share" min="0" max="100" step="5" value="${dr.shareMax}" aria-label="Доля первого человека">
        <div class="chips" style="margin-top:10px"><button type="button" class="chip" data-share="50">50/50</button><button type="button" class="chip" data-share="60">60/40</button><button type="button" class="chip" data-share="70">70/30</button><button type="button" class="chip" data-share="income">По доходам</button></div>
        <div class="preview" id="f-preview"></div>`;
    } else if (dr.type === 'income') {
      h += `<label class="l">Категория</label>${catGrid(cats('income', INCOME_CATEGORIES), dr.category)}
      <label class="l">Куда пришли деньги</label>${walletChips('wallet', dr.wallet)}<label class="l">Способ</label>${methodChips('method', dr.method)}`;
    } else {
      h += `<label class="l">Быстро</label><div class="chips"><button type="button" class="chip" data-preset="cash">${ic('cash')} Снял(а) наличные</button><button type="button" class="chip" data-preset="joint">${ic('bank')} В общий котёл</button><button type="button" class="chip" data-preset="settle">${ic('swap')} Вернул(а) долг</button></div>
      <label class="l">Откуда</label>${walletChips('from', dr.from)}<div style="height:8px"></div>${methodChips('fromMethod', dr.fromMethod)}
      <label class="l">Куда</label>${walletChips('to', dr.to)}<div style="height:8px"></div>${methodChips('toMethod', dr.toMethod)}
      <div class="preview">Перевод в «Общий котёл» — пополнение, а не расход. Между вашими кошельками — взаиморасчёт, он гасит долг.</div>`;
    }
    h += `<label class="l" for="f-date">Дата</label><input type="date" id="f-date" value="${dr.date}"><label class="l" for="f-note">Заметка</label><input id="f-note" placeholder="Необязательно" value="${esc(dr.note)}">`;
    if (dr.type !== 'transfer') h += `<label class="switch"><span>Скрыть детали от партнёра<br><span class="muted sm">Будет видна только сумма</span></span><input type="checkbox" id="f-hidden" ${dr.hidden ? 'checked' : ''}></label>`;
    return h + `${error ? `<div class="error">${esc(error)}</div>` : ''}<button class="primary" id="f-save">${dr.editId ? 'Сохранить изменения' : 'Добавить'}</button>`;
  },
  bind(root, s, a) {
    const setChip = (name, v) => {
      readForm(); error = ''; draft[name] = v;
      if (name === 'type') draft.category = v === 'income' ? (INCOME_CATEGORIES[0]) : EXPENSE_CATEGORIES[0];
      if (name === 'person') { draft.wallet = v; draft.paidFrom = v; draft.from = v; }
      if (name === 'scope') draft.paidFrom = draft.person;
      a.render();
    };
    $$('[data-chips]', root).forEach((box) => $$('button', box).forEach((b) => (b.onclick = () => setChip(box.dataset.chips, b.dataset.v))));
    $$('[data-preset]', root).forEach((b) => (b.onclick = () => {
      readForm(); const p = draft.person || s.viewer;
      if (b.dataset.preset === 'cash') Object.assign(draft, { from: p, fromMethod: 'card', to: p, toMethod: 'cash' });
      if (b.dataset.preset === 'joint') Object.assign(draft, { from: p, fromMethod: 'card', to: 'joint', toMethod: 'card' });
      if (b.dataset.preset === 'settle') Object.assign(draft, { from: p, fromMethod: 'card', to: other(p), toMethod: 'card' });
      a.render();
    }));
    $$('[data-share]', root).forEach((b) => (b.onclick = () => {
      readForm();
      draft.shareMax = b.dataset.share === 'income' ? shareByIncome(inMonth(s.txs, draft.date.slice(0, 7))) : +b.dataset.share;
      const r = $('#f-share'); if (r) r.value = draft.shareMax;
      updatePreview();
    }));
    const share = $('#f-share'); if (share) share.oninput = updatePreview;
    const amt = $('#f-amount'); if (amt) amt.oninput = updatePreview;
    updatePreview();
    const cn = $('[data-cancel]', root); if (cn) cn.onclick = () => { draft = null; a.go('feed'); };
    const sv = $('#f-save', root);
    if (sv) sv.onclick = () => {
      readForm();
      const amount = parseMoney(draft.amount);
      let tx = { type: draft.type, amount, date: draft.date || todayStr(), note: draft.note.trim(), hidden: draft.hidden && draft.type !== 'transfer' };
      if (draft.type === 'income') tx = { ...tx, person: draft.person, wallet: draft.wallet, category: draft.category, method: draft.method };
      else if (draft.type === 'expense') {
        tx = { ...tx, person: draft.person, scope: draft.scope, category: draft.category, method: draft.method, paidFrom: draft.scope === 'personal' ? draft.person : draft.paidFrom };
        if (draft.scope === 'shared') tx.shareMax = draft.shareMax;
      } else tx = { ...tx, from: draft.from, to: draft.to, fromMethod: draft.fromMethod, toMethod: draft.toMethod };
      const errs = validate(tx);
      if (errs.length) { error = errs[0]; a.render(); return; }
      if (draft.editId) a.store.update(draft.editId, tx); else a.store.add(tx);
      a.setMonth(tx.date.slice(0, 7));
      draft = null; error = '';
      a.go('feed');
    };
  },
};
