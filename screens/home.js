import { PEOPLE, balancesByMethod, debt, stats, inMonth, other } from '../ledger.js';
import { ic, av, nameOf, init, feminine, money as fm, monthSwitch, monthLabel, $ } from '../core.js';
import widgets from '../widgets/index.js';

export default {
  render(s, a) {
    const all = s.txs, bm = balancesByMethod(all), d = debt(all), ms = stats(inMonth(all, a.month));
    const jointTotal = bm.joint.card + bm.joint.cash;
    const hero = `<section class="hero"><div class="lab">${ic('bank')} Общий котёл</div><div class="sum">${fm(jointTotal)}</div>
      <div class="split"><span><em>${ic('card')} Карта</em><b>${fm(bm.joint.card)}</b></span><span><em>${ic('cash')} Наличные</em><b>${fm(bm.joint.cash)}</b></span></div></section>`;
    const debtor = d > 0 ? 'dinara' : 'max', creditor = other(debtor);
    const settle = d === 0
      ? `<div class="settle"><span class="av joint">${ic('users')}</span><div class="t"><b>Вы квиты</b><span class="muted sm">Никто никому не должен</span></div></div>`
      : `<div class="settle">${av(debtor)}<span class="arrow">${ic('arrow')}</span>${av(creditor)}<div class="t"><b>${fm(Math.abs(d))}</b><span class="muted sm">Вернуть: ${nameOf(debtor)} → ${nameOf(creditor)}</span></div><button class="chip" data-settle>Рассчитаться</button></div>`;
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
    const extra = widgets.map((w) => w.render(s, a)).join('');
    return `<div class="top"><div class="hello"><div class="muted">Привет,</div><b>${nameOf(s.viewer)}</b></div><button class="av ${s.viewer}" data-switch aria-label="Сменить пользователя">${init(s.viewer)}</button></div>
    ${monthSwitch(a.month)}<div class="stack">${first}${hero}<div class="card">${settle}</div>${extra}</div>
    <h2>За ${monthLabel(a.month).split(' ')[0].toLowerCase()}</h2><div class="people">${person('max')}${person('dinara')}</div>`;
  },
  bind(root, s, a) {
    const st = $('[data-settle]', root);
    if (st) st.onclick = () => {
      const d = debt(s.txs); if (!d) return;
      const from = d > 0 ? 'dinara' : 'max', to = other(from);
      a.store.add({ type: 'transfer', amount: Math.abs(d), from, to, fromMethod: 'card', toMethod: 'card', date: a.today(), note: 'Взаиморасчёт', hidden: false });
      a.toast('Долг погашен');
    };
    widgets.forEach((w) => w.bind && w.bind(root, s, a));
  },
};
