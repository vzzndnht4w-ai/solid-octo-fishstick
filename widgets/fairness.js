// Виджет «Шкала справедливости»: кто сколько вложил в общее за месяц относительно своей доли по доходам.
import { ic, esc, nameOf, feminine, money as fm, $ } from '../core.js';
import { fairnessDelta, reactedCount } from '../lib/together.js';
import { plural } from '../lib/together-ui.js';
import { other, inMonth } from '../ledger.js';
import { startWith } from '../screens/add.js';

const whole = (kop) => Math.round(kop / 100) * 100;
const rub = (kop) => String(whole(kop) / 100);

function scale(f) {
  // Положение маркера: 0 — по центру, вправо — вложила больше Динара, влево — Максим.
  const r = Math.max(-0.5, Math.min(0.5, f.delta.dinara / f.total));
  const pos = 50 + r * 100, left = Math.min(50, pos), width = Math.abs(pos - 50);
  const side = f.level === 'even' ? '' : f.delta.dinara > 0 ? 'dinara' : 'max';
  return `<div class="tg-scale" role="img" aria-label="${esc(f.level === 'even' ? 'Вклады почти поровну' : `${nameOf(f.lead)} вложил${feminine(f.lead)} больше своей доли`)}">
    <div class="tg-track"><i class="tg-fill ${side}" style="left:${left}%;width:${width}%"></i><span class="tg-mid"></span><span class="tg-dot ${side}" style="left:${pos}%"></span></div>
    <div class="tg-ends"><span class="max">${esc(nameOf('max'))}</span><span class="mid">поровну по доходам</span><span class="dinara">${esc(nameOf('dinara'))}</span></div></div>`;
}

export default {
  id: 'fairness',
  render(s, a) {
    const f = fairnessDelta(s.txs, a.month);
    const them = s.viewer ? other(s.viewer) : null;
    const reacted = them ? reactedCount(s.comments, inMonth(s.txs, a.month), them) : 0;
    const react = reacted
      ? `<button class="tg-reacted" data-tg-go="feed"><span class="tg-em" aria-hidden="true">${ic('chat')}</span><span>${esc(nameOf(them))} отреагировал${feminine(them)} на ${reacted} ${plural(reacted, 'операцию', 'операции', 'операций')}</span>${ic('right')}</button>` : '';
    if (!f && !react) return '';
    if (!f) return `<section class="card tg-fair">${react}</section>`;
    const lead = f.lead, big = f.amount > f.total * 0.15;
    const head = f.level === 'even'
      ? 'В этом месяце вклады ровно по доходам. Так держать.'
      : `В этом месяце ${esc(nameOf(lead))} вложил${feminine(lead)} ${big ? 'заметно' : 'чуть'} больше своей доли: ${fm(whole(f.amount))}`;
    const per = (p) => `<div class="tg-p ${p}"><small>${esc(nameOf(p))}</small><b>${fm(f.put[p])}</b><span>доля ${fm(f.fair[p])} · ${Math.round(f.share[p] * 100)}%</span></div>`;
    const me = s.viewer, under = f.under;
    const action = f.level === 'even' || !me ? '' : me === under
      ? `<button class="tg-act" data-tg-fix="${under}">${ic('plus')} Пополнить баланс на ${fm(whole(f.amount))}</button>`
      : `<button class="tg-act" data-tg-fix="${under}">${ic('swap')} Записать пополнение · ${esc(nameOf(under))}</button>`;
    const hint = f.level === 'even' ? '' : `<p class="tg-hint">Чтобы выровнять, ${esc(nameOf(under))} может пополнить общий баланс на ${fm(whole(f.amount))}. Это не долг, а способ вложить поровну по доходам.</p>`;
    return `<section class="card tg-fair" aria-label="Шкала справедливости"><div class="tg-head"><b>${ic('scale')} Справедливость</b><span class="muted sm">за месяц</span></div>
      <p class="tg-lead">${head}</p>${scale(f)}<div class="tg-pair">${per('max')}${per('dinara')}</div>${hint}${action}${react}</section>`;
  },
  bind(root, s, a) {
    const fix = $('[data-tg-fix]', root);
    if (fix) fix.onclick = () => {
      const f = fairnessDelta(s.txs, a.month); if (!f) return;
      startWith({ type: 'transfer', person: f.under, from: f.under, fromMethod: 'card', to: 'joint', toMethod: 'card', amount: rub(f.amount), note: 'Выравниваем вклады' }, s);
      a.go('add', { keepDraft: true });
    };
    const go = $('[data-tg-go]', root);
    if (go) go.onclick = () => a.go(go.dataset.tgGo);
  },
};
