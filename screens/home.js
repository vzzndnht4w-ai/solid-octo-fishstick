import { PEOPLE, balancesByMethod, debt, stats, inMonth, other, reservedInGoals } from '../ledger.js';
import { ic, av, esc, nameOf, init, feminine, money as fm, monthSwitch, monthLabel, $ } from '../core.js';
import widgets from '../widgets/index.js';
import { debtAgeDays, plural } from '../lib/tools.js';
import { load as loadInbox, unreadCount } from '../lib/inbox.js';

const OLD_DEBT_DAYS = 14, OLD_DEBT_MIN = 100000;
/** Мягкое напоминание, если долг висит дольше 14 дней и больше 1 000 ₽. */
export function debtNote(txs, d, today) {
  if (Math.abs(d) <= OLD_DEBT_MIN) return '';
  const days = debtAgeDays(txs, today);
  if (days == null || days <= OLD_DEBT_DAYS) return '';
  const w = Math.round(days / 7), m = Math.round(days / 30);
  const age = days < 60 ? `${w} ${plural(w, 'неделю', 'недели', 'недель')}` : `около ${m} ${plural(m, 'месяца', 'месяцев', 'месяцев')}`;
  return `<p class="debtnote" role="note">Долг висит ${age} — самое время рассчитаться</p>`;
}

/** Колокольчик «Что нового» с числом непрочитанных. */
const bell = (viewer) => {
  const n = unreadCount(loadInbox(viewer));
  return `<button class="bell" data-inbox aria-label="Что нового${n ? `: непрочитанных ${n}` : ''}">${ic('bell')}${n ? `<span class="bn" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
};

export default {
  render(s, a) {
    const all = s.txs, bm = balancesByMethod(all), d = debt(all), ms = stats(inMonth(all, a.month));
    const jointTotal = bm.joint.card + bm.joint.cash, reserved = reservedInGoals(all);
    const hero = `<section class="hero"><div class="lab">${ic('bank')} Общий баланс</div><div class="sum">${fm(jointTotal)}</div>
      <div class="split"><span><em>${ic('card')} Карта</em><b>${fm(bm.joint.card)}</b></span><span><em>${ic('cash')} Наличные</em><b>${fm(bm.joint.cash)}</b></span></div>${reserved ? `<div class="hero-res"><span>В целях <b>${fm(reserved)}</b></span><span>Свободно <b>${fm(jointTotal - reserved)}</b></span></div>` : ''}</section>`;
    const debtor = d > 0 ? 'dinara' : 'max', creditor = other(debtor);
    const settle = d === 0
      ? `<div class="settle"><span class="av joint">${ic('users')}</span><div class="t"><b>Вы квиты</b><span class="muted sm">Никто никому не должен</span></div></div>`
      : `<div class="settle">${av(debtor)}<span class="arrow">${ic('arrow')}</span>${av(creditor)}<div class="t"><b>${fm(Math.abs(d))}</b><span class="muted sm">Вернуть: ${esc(nameOf(debtor))} → ${esc(nameOf(creditor))}</span></div><button class="chip" data-settle>Рассчитаться</button>${debtNote(all, d, a.today())}</div>`;
    const person = (p) => {
      const spent = ms[p].personal + ms[p].sharedShare, left = ms[p].earned - spent;
      const pct = ms[p].earned ? Math.min(100, Math.round((spent / ms[p].earned) * 100)) : spent ? 100 : 0;
      return `<div class="pcard ${p}"><div class="h">${av(p, 'sm')}${esc(nameOf(p))}</div>
        <div class="kv"><small>Заработал${feminine(p)}</small><b class="pos">${fm(ms[p].earned)}</b></div>
        <div class="kv"><small>Потратил${feminine(p)}</small><b>${fm(spent)}</b></div>
        <div class="mini" title="${pct}% дохода потрачено"><i style="width:${pct}%"></i></div>
        <div class="kv"><small>Остаток за месяц</small><b class="${left < 0 ? 'neg' : ''}">${fm(left)}</b></div>
        <div class="wallet"><span>${ic('card')}${fm(bm[p].card)}</span><span>${ic('cash')}${fm(bm[p].cash)}</span></div></div>`;
    };
    const first = !all.length ? `<div class="tip"><span class="tile">${ic('bulb')}</span><div><b>Начните с дохода</b><br><span class="muted">Нажмите «+», выберите «Доход» и запишите зарплату. Потом пополните общий баланс переводом.</span></div></div>` : '';
    const extra = widgets.map((w) => w.render(s, a)).join('');
    return `<div class="top"><div class="hello"><div class="muted">Привет,</div><b>${esc(nameOf(s.viewer))}</b></div><div class="topr">${bell(s.viewer)}<button class="av ${s.viewer}" data-switch aria-label="Сменить пользователя">${init(s.viewer)}</button></div></div>
    ${monthSwitch(a.month)}<div class="stack">${first}${hero}<div class="card">${settle}</div>
    <div><h2 style="margin-top:14px">За ${monthLabel(a.month).split(' ')[0].toLowerCase()}</h2><div class="people first">${person('max')}${person('dinara')}</div></div>${extra}</div>`;
  },
  bind(root, s, a) {
    const bl = $('[data-inbox]', root);
    if (bl) bl.onclick = () => a.go('inbox');
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
