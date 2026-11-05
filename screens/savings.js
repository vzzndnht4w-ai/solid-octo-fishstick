// Накопления: наличные, карты, счета, вклады, инвестиции. Отдельный учёт — не влияет на баланс и долги.
import '../lib/savings-icons.js';
import { parseMoney, validate, balances, balancesByMethod } from '../ledger.js';
import { ic, esc, nameOf, av, money as fm, subHeader, MONTHS_GEN, $, $$ } from '../core.js';
import { openSheet, chips, bindChips, amountField, kopToInput } from '../planui.js';
import { KINDS, KIND_ORDER, kindOf, isMasked, totalFor, byOwner, groupItems, yearlyYield, daysLeft, parseRate, applyOp, withPoint, chartSeries, balanceOf, linkedTxs, savedFromWallets, checkMove } from '../lib/savings.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const MODE_KEY = 'we-savings-mode';
let mode = 'people';
try { if (localStorage.getItem(MODE_KEY) === 'kinds') mode = 'kinds'; } catch {}
const shortDate = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`; };
const untilShort = (u) => `${+u.slice(8, 10)} ${MONTHS_GEN[+u.slice(5, 7) - 1].slice(0, 3)}`;
const ownerName = (o) => (o === 'joint' ? 'Общие' : nameOf(o));
const ownerChips = (cur) => chips('owner', ['max', 'dinara', 'joint'].map((p) => [p, `${p === 'joint' ? `<span class="av joint sm">${ic('users')}</span>` : av(p, 'sm')}${esc(ownerName(p))}`]), cur, (v) => v);
const kindIcon = (k) => `<span class="tile" style="--h:${kindOf(k).color}">${ic(kindOf(k).icon)}</span>`;

/** Подпись вклада: «под 7,5% · до 12 мар» и расчёт годовой доходности. */
function depositLine(it, today, txs) {
  if (it.kind !== 'deposit') return '';
  const parts = [];
  if (Number(it.rate) > 0) parts.push(`под ${String(it.rate).replace('.', ',')}%`);
  if (it.until) {
    const d = daysLeft(it.until, today);
    parts.push(d !== null && d < 0 ? `срок вышел ${untilShort(it.until)}` : `до ${untilShort(it.until)}`);
  }
  const y = yearlyYield(it, txs);
  return (parts.length ? `<div class="svsub">${esc(parts.join(' · '))}</div>` : '') + (y ? `<div class="svsub">≈ ${fm(y)} за год</div>` : '');
}

const walletName = (w) => (w === 'joint' ? 'Общий баланс' : nameOf(w));
const signed = (n) => `${n > 0 ? '+' : '−'}${fm(Math.abs(n))}`;
const flowLine = (it, txs) => { const f = savedFromWallets(it, txs); return linkedTxs(it, txs, 1).length ? `<div class="svsub">Отложено с кошельков: ${fm(f)}</div>` : ''; };

function tileHtml(it, s, today) {
  if (isMasked(it, s.viewer)) {
    return `<div class="svitem masked">${kindIcon(it.kind)}<div class="g"><b>${esc(it.name)}</b><div class="svsub">${esc(kindOf(it.kind).label)}</div></div><span class="svamt hid">${ic('lock')} Скрыто</span></div>`;
  }
  return `<button type="button" class="svitem" data-open="${esc(it.id)}" aria-label="${esc(`${it.name}, ${fm(balanceOf(it, s.txs))}. Открыть действия`)}">${kindIcon(it.kind)}<div class="g"><b>${esc(it.name)}</b>
    <div class="svsub">${esc(kindOf(it.kind).label)}${mode === 'kinds' ? ` · ${esc(ownerName(it.owner))}` : ''}${it.hidden ? ` · скрыто от партнёра` : ''}</div>${depositLine(it, today, s.txs)}${flowLine(it, s.txs)}</div><span class="svamt">${fm(balanceOf(it, s.txs))}</span></button>`;
}

function chartHtml(items, s) {
  const pts = chartSeries(items, s.viewer, s.txs, 12);
  if (!pts.length) return '';
  const W = 320, H = 110, px = 8, top = 10, bot = 22;
  const vals = pts.map((p) => p.amount);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i) => px + (i * (W - 2 * px)) / (pts.length - 1);
  const y = (v) => top + (H - top - bot) * (1 - (v - lo) / span);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.amount).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)} ${H - bot}L${x(0).toFixed(1)} ${H - bot}Z`;
  const dots = pts.map((p, i) => `<circle class="svdot ${i === pts.length - 1 ? 'last' : ''}" cx="${x(i).toFixed(1)}" cy="${y(p.amount).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}"/>`).join('');
  const first = pts[0], last = pts[pts.length - 1];
  const delta = last.amount - first.amount;
  const desc = `Динамика накоплений: с ${shortDate(first.at)} ${fm(first.amount)}, на ${shortDate(last.at)} ${fm(last.amount)}`;
  return `<section class="card svchart" aria-label="Динамика накоплений"><div class="row"><b>Динамика</b><span class="sm ${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : '−'}${fm(Math.abs(delta))}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}" preserveAspectRatio="none">
      <line class="svgrid" x1="${px}" x2="${W - px}" y1="${H - bot}" y2="${H - bot}"/><path class="svarea" d="${area}"/><path class="svline" d="${line}"/>${dots}
      <text class="svtxt" x="${px}" y="${H - 6}" text-anchor="start">${esc(shortDate(first.at))}</text><text class="svtxt" x="${W - px}" y="${H - 6}" text-anchor="end">${esc(shortDate(last.at))}</text></svg>
    <div class="row sm muted"><span>${fm(first.amount)}</span><span>${fm(last.amount)}</span></div>
    <table class="sr-only"><caption>Сумма накоплений по датам</caption><thead><tr><th>Дата</th><th>Сумма</th></tr></thead><tbody>${pts.map((p) => `<tr><td>${esc(shortDate(p.at))}</td><td>${fm(p.amount)}</td></tr>`).join('')}</tbody></table></section>`;
}

function summaryHtml(items, s) {
  const total = totalFor(items, s.viewer, s.txs), o = byOwner(items, s.viewer, s.txs);
  const parts = [['max', 'var(--max)'], ['dinara', 'var(--dinara)'], ['joint', 'var(--joint)']];
  const bar = total > 0 ? parts.filter(([k]) => o[k] > 0).map(([k, c]) => `<i style="flex:${o[k]};background:${c}"></i>`).join('') : '';
  const lab = parts.map(([k, c]) => `<div><span class="dot" style="background:${c}"></span><span class="muted sm">${esc(ownerName(k))}</span><b>${fm(o[k])}</b></div>`).join('');
  return `<section class="card svsum"><div class="muted sm">Всего накоплений</div><div class="svtotal">${fm(total)}</div>
    <div class="svbar" role="img" aria-label="${esc(parts.map(([k]) => `${ownerName(k)} ${fm(o[k])}`).join(', '))}">${bar}</div><div class="svlegend3">${lab}</div></section>`;
}

/** «Всего у вас»: кошельки (включая общий баланс) + накопления. */
function overallHtml(items, s) {
  const w = balances(s.txs), wallets = w.max + w.dinara + w.joint, sav = totalFor(items, s.viewer, s.txs);
  return `<section class="card svall" aria-label="Всего у вас"><div class="muted sm">Всего у вас</div>
    <dl class="svrows"><div><dt>На кошельках<small>Максим, Динара и общий баланс (он уже здесь)</small></dt><dd>${fm(wallets)}</dd></div>
    <div><dt>В накоплениях</dt><dd>${fm(sav)}</dd></div><div class="tot"><dt>Всего</dt><dd>${fm(wallets + sav)}</dd></div></dl></section>`;
}

// ---------- шторки ----------
const sheetKeys = (sh) => {
  const onKey = (e) => {
    if ($('#sheet').hidden || !sh.el.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); sh.close(); }
  };
  document.addEventListener('keydown', onKey);
};
const head = (title, sub = '') => `<div class="row sheethead"><div><h1 style="font-size:22px;margin:0">${esc(title)}</h1>${sub}</div><button type="button" class="iconbtn" data-x aria-label="Закрыть">${ic('x')}</button></div>`;

function edit(it0, a, kind0) {
  const s = a.store.get(), isNew = !it0;
  const kind = it0?.kind || kind0 || 'cash';
  const f = { kind, name: it0?.name ?? kindOf(kind).label, nameTouched: !isNew, owner: it0?.owner || s.viewer || 'max', amount: kopToInput(it0 ? balanceOf(it0, s.txs) : 0), rate: it0?.rate != null ? String(it0.rate).replace('.', ',') : '', until: it0?.until || '', note: it0?.note || '', hidden: !!it0?.hidden };
  let err = '', confirm = false;
  const sh = openSheet('');
  sheetKeys(sh);
  const draw = () => {
    const dep = f.kind === 'deposit';
    sh.el.innerHTML = `<div class="grab"></div>${head(isNew ? 'Новый счёт' : 'Изменить счёт')}
      <label class="l">Тип</label>${chips('kind', KIND_ORDER.map((k) => [k, `${ic(KINDS[k].icon)}${esc(KINDS[k].label)}`]), f.kind)}
      <label class="l" for="sv-name">Название</label><input id="sv-name" maxlength="40" value="${esc(f.name)}" placeholder="Например, Накопительный счёт">
      <label class="l">Чьи деньги</label>${ownerChips(f.owner)}
      <label class="l" for="sv-amount">${isNew ? 'Сколько сейчас' : 'Остаток'}</label>${amountField('sv-amount', f.amount, s.settings.currency)}
      ${dep ? `<div class="btns2"><div><label class="l" for="sv-rate">Ставка, % годовых</label><input id="sv-rate" inputmode="decimal" placeholder="7,5" value="${esc(f.rate)}"></div><div><label class="l" for="sv-until">Срок до</label><input type="date" id="sv-until" value="${esc(f.until)}"></div></div>` : ''}
      <label class="l" for="sv-note">Заметка (необязательно)</label><input id="sv-note" maxlength="80" value="${esc(f.note)}">
      ${f.owner !== 'joint' ? `<label class="switch"><span>Скрыть остаток от партнёра<br><small class="muted">Партнёр увидит только название и «Скрыто»</small></span><input type="checkbox" id="sv-hid" ${f.hidden ? 'checked' : ''}></label>` : ''}
      ${err ? `<div class="error" role="alert">${esc(err)}</div>` : ''}<button class="primary" id="sv-save">${isNew ? 'Добавить' : 'Сохранить'}</button>
      ${!isNew ? (confirm
        ? `<div class="preview" role="alert">Счёт «${esc(it0.name)}» и его история исчезнут. Это нельзя отменить.</div><div class="btns2"><button class="ghost" id="sv-keep" style="text-align:center">Не удалять</button><button class="ghost danger" id="sv-del2" style="text-align:center">Да, удалить</button></div>`
        : '<button class="ghost danger" id="sv-del" style="margin-top:10px;text-align:center">Удалить счёт</button>') : ''}`;
    const read = () => {
      f.name = $('#sv-name', sh.el).value; f.amount = $('#sv-amount', sh.el).value; f.note = $('#sv-note', sh.el).value;
      const r = $('#sv-rate', sh.el), u = $('#sv-until', sh.el), h = $('#sv-hid', sh.el);
      if (r) f.rate = r.value; if (u) f.until = u.value; if (h) f.hidden = h.checked;
      f.nameTouched = f.nameTouched || f.name !== kindOf(f.kind).label;
    };
    $('[data-x]', sh.el).onclick = sh.close;
    bindChips(sh.el, (n, v) => {
      read();
      if (n === 'kind') { if (!f.nameTouched || f.name === kindOf(f.kind).label) f.name = kindOf(v).label; f.kind = v; }
      if (n === 'owner') { f.owner = v; if (v === 'joint') f.hidden = false; }
      err = ''; draw();
    });
    $('#sv-save', sh.el).onclick = () => {
      read();
      const name = f.name.trim() || kindOf(f.kind).label;
      const raw = f.amount.trim();
      const amount = raw === '' ? 0 : parseMoney(raw) ?? (/^0+([.,]0*)?$/.test(raw) ? 0 : null);
      if (amount === null) { err = 'Введите сумму числом'; draw(); return; }
      const rate = f.kind === 'deposit' ? parseRate(f.rate) : null;
      if (Number.isNaN(rate)) { err = 'Ставка — число от 0 до 100'; draw(); return; }
      const base = { ...(it0 || { id: uid(), history: [] }), name, kind: f.kind, owner: f.owner, note: f.note.trim() };
      if (rate !== null) base.rate = rate; else delete base.rate;
      if (f.kind === 'deposit' && f.until) base.until = f.until; else delete base.until;
      if (!base.note) delete base.note;
      if (f.hidden && f.owner !== 'joint') base.hidden = true; else delete base.hidden;
      const item = isNew || !it0 || balanceOf(it0, a.store.get().txs) !== amount ? withPoint(base, amount) : base;
      sh.close();
      a.store.mutate((st) => { st.savings = isNew ? [...st.savings, item] : st.savings.map((x) => (x.id === item.id ? item : x)); });
      a.toast(isNew ? 'Счёт добавлен' : 'Сохранено');
    };
    const d = $('#sv-del', sh.el); if (d) d.onclick = () => { read(); confirm = true; draw(); };
    const k = $('#sv-keep', sh.el); if (k) k.onclick = () => { read(); confirm = false; draw(); };
    const d2 = $('#sv-del2', sh.el); if (d2) d2.onclick = () => { sh.close(); a.store.mutate((st) => { st.savings = st.savings.filter((x) => x.id !== it0.id); }); a.toast('Счёт удалён'); };
    setTimeout(() => (isNew && !f.nameTouched ? $('#sv-amount', sh.el) : $('#sv-name', sh.el))?.focus(), 60);
  };
  draw();
}

const OPS = {
  in: { title: 'Изменить остаток: добавить', btn: 'Добавить', hint: 'Сколько пришло извне (проценты, поступление)', icon: 'plus' },
  out: { title: 'Изменить остаток: убрать', btn: 'Убрать', hint: 'Сколько ушло не на кошелёк', icon: 'sv-minus' },
  set: { title: 'Задать остаток', btn: 'Сохранить остаток', hint: 'Новый остаток — например, сверка с банком', icon: 'sv-pencil-eq' },
};

function operate(id, op, a) {
  const cur = () => a.store.get().savings.find((x) => x.id === id);
  const it = cur(); if (!it) return;
  const cfg = OPS[op], s = a.store.get();
  let err = '';
  const sh = openSheet('');
  sheetKeys(sh);
  const draw = (val = op === 'set' ? kopToInput(balanceOf(it, s.txs)) : '') => {
    sh.el.innerHTML = `<div class="grab"></div>${head(cfg.title, `<div class="muted sm">${esc(it.name)} · сейчас ${fm(balanceOf(it, s.txs))}</div>`)}
      <label class="l" for="sv-op">${esc(cfg.hint)}</label>${amountField('sv-op', val, s.settings.currency)}
      ${err ? `<div class="error" role="alert">${esc(err)}</div>` : ''}<button class="primary" id="sv-go">${esc(cfg.btn)}</button>`;
    $('[data-x]', sh.el).onclick = sh.close;
    const inp = $('#sv-op', sh.el);
    $('#sv-go', sh.el).onclick = () => {
      const raw = inp.value.trim();
      const v = raw === '' ? null : parseMoney(raw) ?? (/^0+([.,]0*)?$/.test(raw) ? 0 : null);
      const r = applyOp(it, op, v, Date.now(), a.store.get().txs);
      if (r.error) { err = r.error; draw(inp.value); return; }
      sh.close();
      a.store.mutate((st) => { st.savings = st.savings.map((x) => (x.id === id ? applyOp(x, op, v, Date.now(), st.txs).item || x : x)); });
      a.toast(`${it.name}: ${fm(r.item.amount)}`);
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') $('#sv-go', sh.el).click(); };
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  };
  draw();
}

function move(id, dir, a) {
  const it0 = a.store.get().savings.find((x) => x.id === id); if (!it0) return;
  const f = { wallet: a.store.get().viewer || 'max', method: 'card' };
  let err = '';
  const sh = openSheet('');
  sheetKeys(sh);
  const draw = (val = '') => {
    const s = a.store.get(), it = s.savings.find((x) => x.id === id) || it0;
    const bal = balanceOf(it, s.txs), free = balancesByMethod(s.txs)[f.wallet][f.method];
    sh.el.innerHTML = `<div class="grab"></div>${head(dir > 0 ? 'Отложить с кошелька' : 'Вернуть на кошелёк', `<div class="muted sm">${esc(it.name)} · сейчас ${fm(bal)}</div>`)}
      <label class="l" for="sv-mv">Сумма</label>${amountField('sv-mv', val, s.settings.currency)}
      <label class="l">${dir > 0 ? 'С какого кошелька' : 'На какой кошелёк'}</label>${chips('wallet', ['max', 'dinara', 'joint'].map((w) => [w, `${w === 'joint' ? `<span class="av joint sm">${ic('users')}</span>` : av(w, 'sm')}${esc(walletName(w))}`]), f.wallet, (v) => v)}
      <label class="l">Способ</label>${chips('method', [['card', `${ic('card')}Карта`], ['cash', `${ic('cash')}Наличные`]], f.method)}
      <div class="preview" id="sv-hint">${dir > 0 ? `Свободно на кошельке: <b>${fm(free)}</b>` : `Можно вернуть до: <b>${fm(bal)}</b>`}</div>
      ${err ? `<div class="error" role="alert">${esc(err)}</div>` : ''}<button class="primary" id="sv-go">${dir > 0 ? 'Отложить' : 'Вернуть'}</button>`;
    $('[data-x]', sh.el).onclick = sh.close;
    const inp = $('#sv-mv', sh.el);
    bindChips(sh.el, (n, v) => { f[n] = v; err = ''; draw(inp.value); });
    $('#sv-go', sh.el).onclick = () => {
      const v = parseMoney(inp.value);
      const e = checkMove(v, dir, dir > 0 ? free : bal);
      if (e) { err = e; draw(inp.value); setTimeout(() => $('#sv-mv', sh.el)?.focus(), 30); return; }
      const tx = { id: uid(), type: 'saving', savingId: id, wallet: f.wallet, method: f.method, person: s.viewer || 'max', amount: dir * v, date: a.today(), note: '', hidden: false };
      const errs = validate(tx);
      if (errs.length) { err = errs[0]; draw(inp.value); return; }
      sh.close();
      a.store.add(tx);
      a.toast(`${dir > 0 ? 'Отложено' : 'Возвращено'} ${fm(v)}`, { label: 'Отменить', fn: () => a.store.remove(tx.id) });
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') $('#sv-go', sh.el).click(); };
    setTimeout(() => inp.focus(), 60);
  };
  draw();
}

const linkedHtml = (it, txs) => {
  const list = linkedTxs(it, txs, 3);
  if (!list.length) return '';
  const rows = list.map((t) => `<div class="row sm"><span class="muted">${esc(shortDate(new Date(t.date + 'T12:00:00').getTime()))} · ${esc(walletName(t.wallet))}, ${t.method === 'cash' ? 'наличные' : 'карта'}</span><b>${signed(t.amount)}</b></div>`).join('');
  return `<div class="svsub svflow">Отложено с кошельков: <b>${fm(savedFromWallets(it, txs))}</b></div><label class="l">Последние операции с кошельков</label><div class="card svhist">${rows}</div>`;
};

function detail(id, a) {
  const it = a.store.get().savings.find((x) => x.id === id); if (!it) return;
  const s = a.store.get(), today = a.today();
  const sh = openSheet('');
  sheetKeys(sh);
  const hist = (it.history || []).slice(-3).reverse().map((h) => `<div class="row sm"><span class="muted">${esc(shortDate(h.at))}</span><b>${fm(h.amount)}</b></div>`).join('');
  sh.el.innerHTML = `<div class="grab"></div>${head(it.name, `<div class="muted sm">${esc(kindOf(it.kind).label)} · ${esc(ownerName(it.owner))}</div>`)}
    <div class="svdetail-amt">${fm(balanceOf(it, s.txs))}</div>${depositLine(it, today, s.txs)}${it.note ? `<div class="preview">${esc(it.note)}</div>` : ''}
    <div class="svacts"><button class="ghost" data-op="mv+">${ic('plus')} Отложить с кошелька</button><button class="ghost" data-op="mv-">${ic('sv-minus')} Вернуть на кошелёк</button><button class="ghost" data-op="set">${ic('sv-pencil-eq')} Задать остаток</button><button class="ghost" data-op="in">${ic('plus')} Изменить остаток</button><button class="ghost" data-op="edit">${ic('edit')} Изменить счёт</button></div>
    ${linkedHtml(it, s.txs)}${hist ? `<label class="l">Ручные изменения остатка</label><div class="card svhist">${hist}</div>` : ''}`;
  $('[data-x]', sh.el).onclick = sh.close;
  $$('[data-op]', sh.el).forEach((b) => (b.onclick = () => {
    const o = b.dataset.op; sh.close();
    if (o === 'edit') edit(it, a); else if (o === 'mv+') move(id, 1, a); else if (o === 'mv-') move(id, -1, a); else operate(id, o, a);
  }));
  setTimeout(() => $('[data-op]', sh.el)?.focus(), 60);
}

export default {
  render(s, a) {
    const items = s.savings || [], today = a.today();
    const note = '<p class="svnote muted sm">Накопления не влияют на баланс и долги. Кошелёк меняется, только когда вы откладываете на счёт или возвращаете деньги обратно.</p>';
    if (!items.length) {
      return subHeader('Накопления') + `<div class="empty card" style="margin-top:16px"><div class="big">${ic('bank')}</div><b>Что у вас уже накоплено?</b>
        <span class="muted">Наличные дома, деньги на карте или счёте, вклад — запишите, и вы всегда будете видеть общую картину.</span>
        <div class="svquick">${['cash', 'card', 'account', 'deposit'].map((k) => `<button type="button" class="chip" data-new="${k}">${ic(KINDS[k].icon)}${esc(KINDS[k].label)}</button>`).join('')}</div></div>${note}`;
    }
    const groups = groupItems(items, mode, s.viewer, s.txs);
    const gh = groups.map((g) => `<section class="svgroup" aria-label="${esc(mode === 'kinds' ? KINDS[g.key].label : ownerName(g.key))}"><div class="day"><span>${mode === 'kinds' ? esc(KINDS[g.key].label) : esc(ownerName(g.key))}</span><span>${fm(g.total)}</span></div><div class="list">${g.items.map((it) => tileHtml(it, s, today)).join('')}</div></section>`).join('');
    return subHeader('Накопления') + `<button class="primary addbtn" data-new="">${ic('plus')} Добавить счёт</button><div class="stack" style="margin-top:16px">${overallHtml(items, s)}${summaryHtml(items, s)}${chartHtml(items, s)}
      <div class="seg" role="group" aria-label="Группировка"><button type="button" data-mode="people" class="${mode === 'people' ? 'on' : ''}" aria-pressed="${mode === 'people'}">По людям</button><button type="button" data-mode="kinds" class="${mode === 'kinds' ? 'on' : ''}" aria-pressed="${mode === 'kinds'}">По типам</button></div></div>${gh}${note}`;
  },
  bind(root, s, a) {
    $$('[data-new]', root).forEach((b) => (b.onclick = () => edit(null, a, b.dataset.new || undefined)));
    $$('[data-open]', root).forEach((b) => (b.onclick = () => detail(b.dataset.open, a)));
    $$('[data-mode]', root).forEach((b) => (b.onclick = () => { mode = b.dataset.mode; try { localStorage.setItem(MODE_KEY, mode); } catch {} a.render(); }));
  },
};
