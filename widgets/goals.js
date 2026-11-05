import { ic, esc, money as fm } from '../core.js';
import { goalSaved, goalState } from '../lib/plan.js';
import { ring, bindGo } from '../planui.js';

export default {
  id: 'goals',
  render(s, a) {
    if (!s.goals.length) return '';
    const today = a.today();
    const all = s.goals.map((g) => ({ g, st: goalState(g, goalSaved(s.txs, g.id), today) }));
    // сначала активные, ближе к завершению — выше
    all.sort((x, y) => x.st.done - y.st.done || y.st.pct - x.st.pct);
    const items = all.slice(0, 2).map(({ g, st }) => `<div class="wg lvl-${st.done ? 'done' : 'ok'}">${ring(st.pct, 52, 6, st.done ? ic('check') : `<span class="gemo">${esc(g.emoji || '🎯')}</span>`)}<div class="g"><b>${esc(g.name)}</b><div class="muted sm">${st.done ? 'Цель достигнута' : `${fm(st.saved)} из ${fm(st.target)}`}</div></div><span class="gpct">${Math.round(st.pct * 100)}%</span></div>`).join('');
    return `<section class="sec wgoals"><div class="row whead"><b>${ic('target')} Цели</b><button class="linkbtn" data-plan-go="goals">Все цели ${ic('right')}</button></div>${items}</section>`;
  },
  bind: (root, s, a) => bindGo(root, a),
};
