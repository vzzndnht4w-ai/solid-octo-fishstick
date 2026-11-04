import { EXPENSE_CATEGORIES, parseMoney } from '../ledger.js';
import { ic, esc, tile, money as fm, monthSwitch, shiftMonth, subHeader, $, $$ } from '../core.js';
import { spentByCategory, budgetState } from '../lib/plan.js';
import { openSheet, ring, pbar, budgetCaption, amountField, kopToInput } from '../planui.js';

const cats = (s) => [...EXPENSE_CATEGORIES, ...(s.categories.expense || [])];
const roundRub = (k) => Math.ceil(k / 100 / 100) * 10000; // вверх до сотни рублей, в копейках

function editLimit(cat, s, a) {
  const cur = s.budgets[cat] || 0, viewer = s.viewer;
  const prev = spentByCategory(s.txs, shiftMonth(a.month, -1), viewer)[cat] || 0;
  const now = spentByCategory(s.txs, a.month, viewer)[cat] || 0;
  const sugg = [];
  if (prev > 0) sugg.push([roundRub(prev), `Как в прошлом месяце · ${fm(roundRub(prev))}`]);
  if (now > 0 && roundRub(now) !== roundRub(prev)) sugg.push([roundRub(now), `По текущим тратам · ${fm(roundRub(now))}`]);
  for (const v of [500000, 1000000, 3000000]) if (sugg.length < 4 && !sugg.some((x) => x[0] === v)) sugg.push([v, fm(v)]);
  const sh = openSheet(`<div class="row" style="justify-content:flex-start;gap:12px">${tile(cat)}<div><b style="font-size:18px">${esc(cat)}</b><div class="muted sm">Лимит на месяц</div></div></div>
    <div style="height:12px"></div>${amountField('b-amount', kopToInput(cur), s.settings.currency)}
    <div class="chips" style="margin-top:12px">${sugg.map(([v, l]) => `<button type="button" class="chip" data-set="${v}">${l}</button>`).join('')}</div>
    <div class="error" id="b-err" hidden></div>
    <button class="primary" id="b-save">Сохранить</button>
    ${cur ? '<button class="ghost danger" id="b-del" style="margin-top:10px;text-align:center">Убрать лимит</button>' : ''}`);
  const inp = $('#b-amount', sh.el);
  setTimeout(() => inp.focus(), 60);
  $$('[data-set]', sh.el).forEach((b) => (b.onclick = () => { inp.value = kopToInput(+b.dataset.set); }));
  $('#b-save', sh.el).onclick = () => {
    const v = parseMoney(inp.value);
    if (!v) { const e = $('#b-err', sh.el); e.textContent = 'Введите сумму больше нуля'; e.hidden = false; return; }
    sh.close(); a.store.mutate((st) => { st.budgets = { ...st.budgets, [cat]: v }; });
  };
  const del = $('#b-del', sh.el);
  if (del) del.onclick = () => { sh.close(); a.store.mutate((st) => { const b = { ...st.budgets }; delete b[cat]; st.budgets = b; }); };
}

export default {
  render(s, a) {
    const spent = spentByCategory(s.txs, a.month, s.viewer);
    const list = cats(s), withLimit = list.filter((c) => s.budgets[c] > 0);
    const totL = withLimit.reduce((n, c) => n + s.budgets[c], 0), totS = withLimit.reduce((n, c) => n + (spent[c] || 0), 0);
    let h = subHeader('Бюджеты') + monthSwitch(a.month);
    if (withLimit.length) {
      const st = budgetState(totL, totS);
      h += `<div class="card bsum lvl-${st.level}">${ring(st.pct, 92, 11, `<b>${Math.round(st.pct * 100)}%</b>`)}<div class="g"><div class="muted sm">Потрачено в рамках лимитов</div><div class="bbig">${fm(totS)}</div><div class="muted sm">из ${fm(totL)} · ${budgetCaption(st)}</div></div></div>`;
    } else h += `<div class="tip"><span class="tile">${ic('gauge')}</span><div><b>Задайте лимиты</b><br><span class="muted">Нажмите на категорию и укажите, сколько готовы тратить в месяц. Считаем общие траты и ваши личные.</span></div></div>`;
    h += `<h2>Категории</h2><div class="list">`;
    for (const c of list) {
      const lim = s.budgets[c] || 0;
      if (lim > 0) {
        const st = budgetState(lim, spent[c] || 0);
        h += `<button class="bud lvl-${st.level}" data-cat="${esc(c)}">${tile(c)}<div class="g"><div class="row"><b>${esc(c)}</b><span class="bnum"><b>${fm(st.spent)}</b> / ${fm(lim)}</span></div>${pbar(st.pct)}<div class="cap">${budgetCaption(st)}</div></div></button>`;
      } else {
        h += `<button class="bud" data-cat="${esc(c)}">${tile(c)}<div class="g"><div class="row"><b>${esc(c)}</b><span class="setlim">${spent[c] ? fm(spent[c]) + ' · ' : ''}Задать лимит ${ic('right')}</span></div></div></button>`;
      }
    }
    return h + '</div>';
  },
  bind(root, s, a) {
    $$('[data-cat]', root).forEach((b) => (b.onclick = () => editLimit(b.dataset.cat, s, a)));
  },
};
