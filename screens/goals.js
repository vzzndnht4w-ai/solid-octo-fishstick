import { parseMoney, validate } from '../ledger.js';
import { ic, esc, money as fm, subHeader, MONTHS_GEN, $, $$ } from '../core.js';
import { goalSaved, goalState } from '../lib/plan.js';
import { openSheet, ring, pbar, personChips, bindChips, amountField, kopToInput, dateRu } from '../planui.js';

const EMOJI = ['🎯', '✈️', '🏖️', '🏠', '🚗', '💍', '🎓', '💻', '📱', '🛋️', '🐶', '🎉', '👶', '🎸', '🛡️', '🎁'];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

function fund(g, s, a) {
  const st = goalState(g, goalSaved(s.txs, g.id), a.today());
  let who = s.viewer, err = '';
  const quick = [];
  if (st.need) quick.push(st.need);
  for (const v of [100000, 500000, 1000000]) if (quick.length < 4 && !quick.includes(v)) quick.push(v);
  const sh = openSheet('');
  const draw = (amount = '') => {
    sh.el.innerHTML = `<div class="grab"></div><div class="row" style="justify-content:flex-start;gap:12px"><span class="gemo-tile">${esc(g.emoji || '🎯')}</span><div><b style="font-size:18px">${esc(g.name)}</b><div class="muted sm">Осталось накопить ${fm(st.left)}</div></div></div>
      <div style="height:12px"></div>${amountField('g-amount', amount, s.settings.currency)}
      <div class="chips" style="margin-top:12px">${quick.map((v) => `<button type="button" class="chip" data-set="${v}">${fm(v)}</button>`).join('')}</div>
      <label class="l">Кто откладывает</label>${personChips('who', who)}
      <div class="preview">Деньги переходят с карты в общий котёл и учитываются в этой цели.</div>
      ${err ? `<div class="error">${esc(err)}</div>` : ''}<button class="primary" id="g-save">Пополнить</button>`;
    const inp = $('#g-amount', sh.el);
    $$('[data-set]', sh.el).forEach((b) => (b.onclick = () => { inp.value = kopToInput(+b.dataset.set); }));
    bindChips(sh.el, (n, v) => { amount = inp.value; who = v; err = ''; draw(amount); });
    $('#g-save', sh.el).onclick = () => {
      const tx = { type: 'transfer', from: who, to: 'joint', fromMethod: 'card', toMethod: 'card', goalId: g.id, amount: parseMoney(inp.value), date: a.today(), note: `Цель: ${g.name}`, hidden: false };
      const errs = validate(tx);
      if (errs.length) { err = errs[0]; draw(inp.value); return; }
      sh.close(); a.store.add(tx);
      const after = goalSaved(a.store.get().txs, g.id);
      a.toast(after >= g.target ? `Цель «${g.name}» достигнута!` : `Отложено ${fm(tx.amount)}`);
    };
    if (!amount) setTimeout(() => inp.focus(), 60);
  };
  draw();
}

function edit(g0, s, a) {
  const isNew = !g0;
  const f = { name: g0?.name || '', emoji: g0?.emoji || EMOJI[0], target: kopToInput(g0?.target), deadline: g0?.deadline || '' };
  let err = '', confirm = false;
  const sh = openSheet('');
  const draw = () => {
    sh.el.innerHTML = `<div class="grab"></div><h1 style="font-size:22px">${isNew ? 'Новая цель' : 'Цель'}</h1>
      <label class="l">Название</label><input id="g-name" placeholder="Например, Отпуск" maxlength="40" value="${esc(f.name)}">
      <label class="l">Значок</label><div class="emojis" data-chips="emoji">${EMOJI.map((e) => `<button type="button" data-v="${esc(e)}" class="emo ${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
      <label class="l">Сколько нужно накопить</label>${amountField('g-target', f.target, s.settings.currency)}
      <label class="l">К какому сроку (необязательно)</label><input type="date" id="g-deadline" value="${esc(f.deadline)}">
      ${err ? `<div class="error">${esc(err)}</div>` : ''}<button class="primary" id="g-save">${isNew ? 'Создать цель' : 'Сохранить'}</button>
      ${!isNew ? (confirm
        ? `<div class="preview">Цель исчезнет. Уже отложенные деньги останутся в общем котле.</div><div class="btns2"><button class="ghost" id="g-keep" style="text-align:center">Не удалять</button><button class="ghost danger" id="g-del2" style="text-align:center">Да, удалить</button></div>`
        : '<button class="ghost danger" id="g-del" style="margin-top:10px;text-align:center">Удалить цель</button>') : ''}`;
    const read = () => { f.name = $('#g-name', sh.el).value; f.target = $('#g-target', sh.el).value; f.deadline = $('#g-deadline', sh.el).value; };
    bindChips(sh.el, (n, v) => { read(); f.emoji = v; draw(); });
    $('#g-save', sh.el).onclick = () => {
      read();
      const target = parseMoney(f.target), name = f.name.trim();
      if (!name) { err = 'Назовите цель'; draw(); return; }
      if (!target) { err = 'Укажите сумму больше нуля'; draw(); return; }
      const goal = { ...(g0 || { id: uid(), createdAt: Date.now() }), name, emoji: f.emoji, target };
      if (f.deadline) goal.deadline = f.deadline; else delete goal.deadline;
      sh.close();
      a.store.mutate((st) => { st.goals = isNew ? [...st.goals, goal] : st.goals.map((x) => (x.id === goal.id ? goal : x)); });
    };
    const d = $('#g-del', sh.el); if (d) d.onclick = () => { read(); confirm = true; draw(); };
    const k = $('#g-keep', sh.el); if (k) k.onclick = () => { read(); confirm = false; draw(); };
    const d2 = $('#g-del2', sh.el); if (d2) d2.onclick = () => { sh.close(); a.store.mutate((st) => { st.goals = st.goals.filter((x) => x.id !== g0.id); }); };
  };
  draw();
}

export default {
  render(s, a) {
    const today = a.today();
    let h = subHeader('Цели') + `<button class="primary addbtn" data-new>${ic('plus')} Новая цель</button>`;
    if (!s.goals.length) return h + `<div class="empty card" style="margin-top:16px"><div class="big">${ic('target')}</div><b>Копите вместе</b><span class="muted">Отпуск, ремонт, подушка безопасности — создайте цель и откладывайте в общий котёл</span></div>`;
    h += '<div class="stack" style="margin-top:16px">';
    for (const g of s.goals) {
      const st = goalState(g, goalSaved(s.txs, g.id), today);
      const plan = st.done ? '' : st.overdue ? `<div class="gplan warn">${ic('calendar')}<span>Срок вышел ${dateRu(g.deadline, MONTHS_GEN)}</span></div>`
        : st.need ? `<div class="gplan">${ic('calendar')}<span>Откладывать <b>~${fm(st.need)}</b> в месяц до ${dateRu(g.deadline, MONTHS_GEN)}</span></div>`
        : g.deadline ? `<div class="gplan">${ic('calendar')}<span>До ${dateRu(g.deadline, MONTHS_GEN)}</span></div>` : '';
      h += `<div class="card goal lvl-${st.done ? 'done' : 'ok'}" data-gid="${esc(g.id)}">
        <div class="gtop">${ring(st.pct, 84, 10, st.done ? ic('check') : `<span class="gemo big">${esc(g.emoji || '🎯')}</span>`)}
        <div class="g"><div class="row"><b class="gname">${esc(g.name)}</b><button class="iconbtn" data-edit="${esc(g.id)}" aria-label="Изменить цель">${ic('edit')}</button></div>
        <div class="gsum"><b>${fm(st.saved)}</b> <span class="muted">из ${fm(st.target)}</span></div>
        ${st.done ? `<span class="badge">${ic('check')} Цель достигнута</span>` : `<div class="muted sm">Осталось ${fm(st.left)}</div>`}</div></div>
        ${st.done ? '' : pbar(st.pct)}${plan}
        <button class="${st.done ? 'ghost' : 'primary'} gfund" data-fund="${esc(g.id)}">${ic('plus')} Пополнить</button></div>`;
    }
    return h + '</div>';
  },
  bind(root, s, a) {
    const find = (id) => s.goals.find((g) => g.id === id);
    $('[data-new]', root).onclick = () => edit(null, s, a);
    $$('[data-edit]', root).forEach((b) => (b.onclick = () => edit(find(b.dataset.edit), s, a)));
    $$('[data-fund]', root).forEach((b) => (b.onclick = () => fund(find(b.dataset.fund), s, a)));
  },
};
