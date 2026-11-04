import { ic, esc, tile, money as fm } from '../core.js';
import { spentByCategory, budgetRows } from '../lib/plan.js';
import { pbar, budgetCaption, bindGo } from '../planui.js';

export default {
  id: 'budgets',
  render(s, a) {
    const rows = budgetRows(s.budgets, spentByCategory(s.txs, a.month, s.viewer));
    if (!rows.length) return '';
    const items = rows.slice(0, 3).map((r) => `<div class="wb lvl-${r.level}">${tile(r.cat)}<div class="g"><div class="row"><b>${esc(r.cat)}</b><span class="cap">${budgetCaption(r)}</span></div>${pbar(r.pct)}</div></div>`).join('');
    return `<section class="card wbud"><div class="row whead"><b>${ic('gauge')} Бюджеты</b><button class="linkbtn" data-plan-go="budgets">Все бюджеты ${ic('right')}</button></div>${items}</section>`;
  },
  bind: (root, s, a) => bindGo(root, a),
};
