// Виджет «Челленджи»: до двух активных со стриком и полоской. Нет активных — ничего не показывает.
import { ic, esc } from '../core.js';
import { challengeProgress, visibleTxs, CHALLENGE_TYPES, plural } from '../lib/play.js';
import '../lib/play-icons.js';

export default {
  id: 'streaks',
  render(s, a) {
    if (!s.challenges?.length) return '';
    const txs = visibleTxs(s.txs, s.viewer), today = a.today();
    const act = s.challenges.map((c) => ({ c, p: challengeProgress(c, txs, today) })).filter((x) => x.p.active)
      .sort((x, y) => y.p.streak - x.p.streak).slice(0, 2);
    if (!act.length) return '';
    const rows = act.map(({ c, p }) => `<button class="pg-row" type="button" data-pg-go aria-label="${esc(c.title)}: ${esc(p.label)}">
      <span class="tile sm" style="--h:#7b6cf0">${ic(CHALLENGE_TYPES[c.type]?.icon || 'target')}</span>
      <span class="pg-mid"><span class="pg-line"><b>${esc(c.title)}</b><span class="pc-streak${p.streak ? '' : ' zero'}">${ic('flame')}<b>${p.streak}</b> ${plural(p.streak, ...p.unit)}</span></span>
      ${p.pct !== null ? `<span class="pbar lvl-ok"><i style="width:${Math.round(p.pct * 100)}%"></i></span>` : ''}<small class="muted">${esc(p.label)}</small></span></button>`).join('');
    return `<section class="sec pgw"><div class="row whead"><b>${ic('flame')} Челленджи</b><button class="linkbtn" type="button" data-pg-go>Все ${ic('right')}</button></div>${rows}</section>`;
  },
  bind(root, s, a) {
    root.querySelectorAll('[data-pg-go]').forEach((b) => (b.onclick = () => a.go('challenges')));
  },
};
