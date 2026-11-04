// Финансовое свидание: раз в неделю 5–10 минут вдвоём. Пошаговый мастер из 6 карточек и история.
import { ic, av, esc, nameOf, feminine, tile, subHeader, money as fm, MONTHS_GEN, dayLabel, $, $$ } from '../core.js';
import { other, balances } from '../ledger.js';
import { spentByCategory, budgetRows, goalSaved, goalState } from '../lib/plan.js';
import { pbar, budgetCaption } from '../planui.js';
import { weekKey, weekRange, shiftWeek, weekSummary, surprisingExpense, questionFor, noteText, notesOf, canSeePartner, noteWeeks, applyNote } from '../lib/together.js';
import '../lib/together-ui.js';

const STEPS = ['Итоги', 'Неожиданное', 'Вопрос', 'Цели', 'Спасибо', 'Итог'];
const STARTERS = ['Спасибо, что ', 'Мне понравилось, как ты ', 'Ценю, что ты '];

let step = 0, dir = 1, animate = false, moved = false, tab = 'wizard';
let draft = null;           // { week, answer, thanks }
let saved = false, err = '';

export const leave = () => { step = 0; dir = 1; animate = false; moved = false; tab = 'wizard'; draft = null; saved = false; err = ''; };

const rangeLabel = (week) => {
  const { from, to } = weekRange(week), f = [+from.slice(8), +from.slice(5, 7) - 1], t = [+to.slice(8), +to.slice(5, 7) - 1];
  return f[1] === t[1] ? `${f[0]}–${t[0]} ${MONTHS_GEN[t[1]]}` : `${f[0]} ${MONTHS_GEN[f[1]].slice(0, 3)} – ${t[0]} ${MONTHS_GEN[t[1]].slice(0, 3)}`;
};
const initDraft = (s, week) => {
  if (!draft || draft.week !== week) {
    draft = { week, answer: noteText(s.dateNotes, week, s.viewer, 'answer'), thanks: noteText(s.dateNotes, week, s.viewer, 'thanks') };
    saved = false;
  }
};
const readForm = (root) => {
  const a = $('#dt-answer', root), t = $('#dt-thanks', root);
  if (a && draft) draft.answer = a.value;
  if (t && draft) draft.thanks = t.value;
};

function diffText(cur, prev, subject) {
  if (!prev && !cur) return '';
  if (!prev) return '';
  const d = cur - prev;
  if (Math.abs(d) < 100) return `${subject} почти как на прошлой неделе`;
  return `${fm(Math.abs(d))} ${d > 0 ? 'больше' : 'меньше'}, чем на прошлой неделе`;
}

// ---------- шаги ----------
function stepSummary(s, week) {
  const cur = weekSummary(s.txs, week), prev = weekSummary(s.txs, shiftWeek(week, -1)), b = balances(s.txs);
  const line = (p) => {
    const d = diffText(cur.spent[p], prev.spent[p]);
    return `<div class="dt-line ${p}">${av(p, 'sm')}<div><b>${esc(nameOf(p))}</b><span>заработал${feminine(p)} <strong class="pos">${fm(cur.earned[p])}</strong>, потратил${feminine(p)} <strong>${fm(cur.spent[p])}</strong></span>${d ? `<small class="muted">${esc(d)}</small>` : ''}</div></div>`;
  };
  const empty = !cur.count ? '<p class="muted dt-note">На этой неделе операций пока нет. Можно поговорить о том, что вы хотели записать.</p>' : '';
  return `<h2 class="dt-h" tabindex="-1" data-dt-title>Как прошла неделя</h2><p class="muted dt-sub">${esc(rangeLabel(week))}</p>${line('max')}${line('dinara')}${empty}
    <div class="dt-pot"><span>${ic('bank')} В общем котле</span><b>${fm(b.joint)}</b></div>`;
}

function stepSurprise(s, week) {
  const r = surprisingExpense(s.txs, week, s.viewer);
  if (!r) return `<h2 class="dt-h" tabindex="-1" data-dt-title>Самая неожиданная трата</h2><p class="dt-big">Трат не было. Тихая неделя.</p><p class="muted dt-note">Бывает и так. Расскажите друг другу, что в эту неделю порадовало, пока кошелёк отдыхал.</p>`;
  const t = r.tx, why = r.ratio && r.ratio >= 1.5 ? `Это в ${String(Math.round(r.ratio * 10) / 10).replace('.', ',')} раза больше обычного для «${esc(t.category)}».` : 'Самая крупная трата недели.';
  return `<h2 class="dt-h" tabindex="-1" data-dt-title>Самая неожиданная трата</h2>
    <button class="dt-tx" data-dt-open="${esc(t.id)}">${tile(t.category)}<span class="g"><b>${esc(t.category)}</b><small class="muted">${esc(dayLabel(t.date))} · ${esc(nameOf(t.person))}${t.scope === 'personal' ? ' · лично' : ' · общая'}</small></span><strong>${fm(t.amount)}</strong></button>
    <p class="dt-note">${why}</p><p class="muted dt-note">Спросите друг друга: что за история? Оставить реакцию можно в карточке операции.</p>`;
}

function stepQuestion(s, week) {
  const me = s.viewer, p = other(me), seen = canSeePartner(s.dateNotes, week, me), theirs = noteText(s.dateNotes, week, p, 'answer');
  const partner = seen && theirs ? `<div class="dt-theirs ${p}"><b>${esc(nameOf(p))}</b><span>${esc(theirs)}</span></div>`
    : `<p class="muted dt-note">${seen || !notesOf(s.dateNotes, week, p).length ? `${esc(nameOf(p))} ещё думает.` : `${esc(nameOf(p))} уже ответил${feminine(p)}. Ответ откроется, когда вы сохраните свои.`}</p>`;
  return `<h2 class="dt-h" tabindex="-1" data-dt-title>Вопрос недели</h2><p class="dt-q">${esc(questionFor(week))}</p>
    <label class="l dt-l" for="dt-answer">Что отвечаю я</label><textarea id="dt-answer" data-fk="dt-answer" rows="4" maxlength="600" placeholder="Пара фраз, как получится">${esc(draft.answer)}</textarea>${partner}`;
}

function stepGoals(s, week, a) {
  const td = a.today(), rows = budgetRows(s.budgets, spentByCategory(s.txs, td.slice(0, 7), s.viewer));
  const goals = s.goals.map((g) => ({ g, st: goalState(g, goalSaved(s.txs, g.id), td) })).sort((x, y) => x.st.done - y.st.done || y.st.pct - x.st.pct);
  const gl = goals.length ? goals.slice(0, 4).map(({ g, st }) => `<div class="dt-row"><span class="dt-emo" aria-hidden="true">${esc(g.emoji || '')}</span><div class="g"><div class="row"><b>${esc(g.name)}</b><span class="muted sm">${st.done ? 'достигнута' : `${fm(st.saved)} из ${fm(st.target)}`}</span></div>${pbar(st.pct)}</div></div>`).join('') : '<p class="muted dt-note">Целей пока нет. Придумайте первую вместе.</p>';
  const bl = rows.length ? rows.slice(0, 4).map((r) => `<div class="dt-row lvl-${r.level}">${tile(r.cat)}<div class="g"><div class="row"><b>${esc(r.cat)}</b><span class="muted sm">${budgetCaption(r)}</span></div>${pbar(r.pct)}</div></div>`).join('') : '<p class="muted dt-note">Бюджетов пока нет.</p>';
  return `<h2 class="dt-h" tabindex="-1" data-dt-title>Цели и бюджеты</h2><h3 class="dt-h3">Цели</h3>${gl}<h3 class="dt-h3">Бюджеты</h3>${bl}`;
}

function stepThanks(s) {
  const p = other(s.viewer);
  return `<h2 class="dt-h" tabindex="-1" data-dt-title>Благодарность</h2><p class="muted dt-sub">Короткая записка партнёру. ${esc(nameOf(p))} прочитает её, когда сохранит свои заметки.</p>
    <label class="l dt-l" for="dt-thanks">Моя записка</label><textarea id="dt-thanks" data-fk="dt-thanks" rows="4" maxlength="600" placeholder="За что хочется сказать спасибо на этой неделе?">${esc(draft.thanks)}</textarea>
    <div class="chips dt-starters" role="group" aria-label="Начало фразы">${STARTERS.map((x, i) => `<button type="button" class="chip" data-dt-start="${i}">${esc(x.trim())}…</button>`).join('')}</div>`;
}

function stepFinish(s, week) {
  const me = s.viewer, p = other(me), seen = canSeePartner(s.dateNotes, week, me);
  const mine = (label, v) => `<div class="dt-sum"><small class="muted">${label}</small><span>${v ? esc(v) : '<em class="muted">не заполнено</em>'}</span></div>`;
  let after = '';
  if (saved || seen) {
    const a = noteText(s.dateNotes, week, p, 'answer'), th = noteText(s.dateNotes, week, p, 'thanks');
    after = a || th
      ? `${a ? `<div class="dt-theirs ${p}"><b>Ответ: ${esc(nameOf(p))}</b><span>${esc(a)}</span></div>` : ''}${th ? `<div class="dt-theirs thanks ${p}"><b>Записка от ${esc(nameOf(p))}</b><span>${esc(th)}</span></div>` : ''}`
      : `<p class="muted dt-note">${esc(nameOf(p))} ещё думает. Ответ появится здесь, как только ${esc(nameOf(p))} сохранит заметки.</p>`;
  }
  return `<h2 class="dt-h" tabindex="-1" data-dt-title>${saved ? 'Сохранено' : 'Сохранить заметки'}</h2>
    ${mine('Мой ответ', draft.answer)}${mine("Записка партнёру", draft.thanks)}
    ${err ? `<div class="error" role="alert">${esc(err)}</div>` : ''}${after}`;
}

// ---------- история ----------
function historyHtml(s) {
  const me = s.viewer, p = other(me), weeks = noteWeeks(s.dateNotes);
  if (!weeks.length) return `<div class="card empty"><div class="big">${ic('note')}</div><b>История пока пуста</b><span class="muted">Сохраните первые заметки на свидании, и они появятся здесь.</span></div>`;
  return weeks.map((w) => {
    const seen = canSeePartner(s.dateNotes, w, me), mine = (k) => noteText(s.dateNotes, w, me, k), theirs = (k) => noteText(s.dateNotes, w, p, k);
    const block = (who, a, t, hidden) => `<div class="dt-hrow ${who}">${av(who, 'sm')}<div>${hidden ? `<span class="muted">${esc(nameOf(who))} ${notesOf(s.dateNotes, w, who).length ? 'ответил' + feminine(who) + '. Откроется после ваших заметок.' : 'ещё думает.'}</span>` : `${a ? `<span>${esc(a)}</span>` : ''}${t ? `<span class="dt-thx">${ic('heart')} ${esc(t)}</span>` : ''}${!a && !t ? '<span class="muted">ничего не писал' + feminine(who) + '</span>' : ''}`}</div></div>`;
    return `<article class="card dt-hist"><div class="row"><b>${esc(rangeLabel(w))}</b><span class="muted sm">${esc(w.replace('-W', ' · нед. '))}</span></div><p class="dt-q sm">${esc(questionFor(w))}</p>${block(me, mine('answer'), mine('thanks'), false)}${block(p, theirs('answer'), theirs('thanks'), !seen)}</article>`;
  }).join('');
}

export default {
  render(s, a) {
    const week = weekKey(a.today());
    initDraft(s, week);
    const tabs = `<div class="seg dt-tabs" role="group" aria-label="Раздел">${[['wizard', 'Свидание'], ['history', 'История']].map(([v, l]) => `<button type="button" data-dt-tab="${v}" class="${tab === v ? 'on' : ''}" aria-pressed="${tab === v}">${l}</button>`).join('')}</div>`;
    if (tab === 'history') return `${subHeader('Финансовое свидание')}${tabs}<div class="stack dt-stack">${historyHtml(s)}</div>`;
    const dots = `<ol class="dt-dots" aria-label="Шаг ${step + 1} из ${STEPS.length}: ${STEPS[step]}">${STEPS.map((t, i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}" ${i === step ? 'aria-current="step"' : ''}><span class="dt-sr">${t}</span></li>`).join('')}</ol>`;
    const body = [stepSummary, stepSurprise, stepQuestion, stepGoals, stepThanks, stepFinish][step](s, week, a);
    const last = step === STEPS.length - 1;
    const nav = `<div class="dt-nav">${step ? '<button type="button" class="ghost dt-back" data-dt-prev>Назад</button>' : '<span></span>'}${last ? (saved ? '<button type="button" class="primary dt-next" data-dt-done>Готово</button>' : '<button type="button" class="primary dt-next" data-dt-save>Сохранить заметки</button>') : '<button type="button" class="primary dt-next" data-dt-next>Далее</button>'}</div>`;
    return `${subHeader('Финансовое свидание')}${tabs}${dots}<section class="card dt-card ${animate ? (dir > 0 ? 'in-fwd' : 'in-back') : ''}" aria-live="polite">${body}</section>${nav}`;
  },
  leave,
  bind(root, s, a) {
    const rerender = () => { animate = true; moved = true; a.render(); };
    const go = (n) => { readForm(root); err = ''; dir = n > step ? 1 : -1; step = n; rerender(); };
    animate = false;
    if (moved) { moved = false; $('[data-dt-title]', root)?.focus({ preventScroll: true }); }
    $$('[data-dt-tab]', root).forEach((b) => (b.onclick = () => { readForm(root); tab = b.dataset.dtTab; a.render(); }));
    $$('[data-dt-prev]', root).forEach((b) => (b.onclick = () => go(step - 1)));
    $$('[data-dt-next]', root).forEach((b) => (b.onclick = () => go(step + 1)));
    $$('[data-dt-open]', root).forEach((b) => (b.onclick = () => a.openTx(b.dataset.dtOpen)));
    $$('[data-dt-done]', root).forEach((b) => (b.onclick = () => { leave(); a.go('more', { back: true }); }));
    $$('[data-dt-start]', root).forEach((b) => (b.onclick = () => {
      const t = $('#dt-thanks', root); if (!t) return;
      if (!t.value.trim()) t.value = STARTERS[+b.dataset.dtStart];
      t.focus(); t.setSelectionRange(t.value.length, t.value.length); readForm(root);
    }));
    ['#dt-answer', '#dt-thanks'].forEach((id) => { const el = $(id, root); if (el) el.oninput = () => readForm(root); });
    $$('[data-dt-save]', root).forEach((b) => (b.onclick = () => {
      readForm(root);
      const exist = notesOf(s.dateNotes, draft.week, s.viewer).length;
      if (!draft.answer.trim() && !draft.thanks.trim() && !exist) { err = 'Напишите ответ или записку, чтобы было что сохранить.'; return a.render(); }
      const at = Date.now();
      saved = true; err = ''; animate = true; moved = true;
      a.store.mutate((st) => {
        applyNote(st.dateNotes, { week: draft.week, person: st.viewer, kind: 'answer', text: draft.answer, at });
        applyNote(st.dateNotes, { week: draft.week, person: st.viewer, kind: 'thanks', text: draft.thanks, at });
      });
      a.toast('Заметки сохранены');
    }));
  },
};
