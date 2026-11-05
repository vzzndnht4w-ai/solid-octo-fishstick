// Быстрые шаблоны: плитки частых трат, создание/правка/удаление, подсказки и «Команды iPhone».
import { subHeader, ic, esc, tile, nameOf, money as fm, $, $$ } from '../core.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, parseMoney } from '../ledger.js';
import { suggestTemplates, templateErrors, buildQuickLink, plural } from '../lib/tools.js';
import { quickAdd, copyText, draftFromTemplate } from '../lib/tools-ui.js';
import { startWith } from './add.js';

let ed = null;            // редактор: null или { id|null, title, type, amount, category, scope, paid, method, shareMax, note, hidden }
let err = '';

const amountText = (kop) => String(kop / 100).replace('.', ',');
const baseUrl = () => { try { return location.origin + location.pathname; } catch { return 'https://…/'; } };
const seg = (name, items, cur, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${items.map(([v, l]) => `<button type="button" data-ed="${name}" data-v="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;

function openEditor(item, s) {
  const t = item?.tpl || {};
  ed = {
    id: item?.id || null, title: item?.title || '', type: t.type || 'expense', amount: t.amount ? amountText(t.amount) : '',
    category: t.category || EXPENSE_CATEGORIES[0], scope: t.scope || 'shared', paid: t.paidFrom === 'joint' ? 'joint' : 'me',
    method: t.method || s.settings.defaultMethod || 'card', shareMax: t.shareMax ?? s.settings.defaultShare ?? 50, note: t.note || '', hidden: !!t.hidden,
    wallet: t.wallet === 'joint' ? 'joint' : 'me',
  };
  err = '';
}

function readEd() {
  if (!ed) return;
  const g = (id) => $('#' + id);
  if (g('t-title')) ed.title = g('t-title').value;
  if (g('t-amount')) ed.amount = g('t-amount').value;
  if (g('t-cat')) ed.category = g('t-cat').value;
  if (g('t-note')) ed.note = g('t-note').value;
  if (g('t-share')) ed.shareMax = +g('t-share').value;
  if (g('t-hidden')) ed.hidden = g('t-hidden').checked;
}

function tplFromEd(s) {
  const tpl = { type: ed.type, amount: parseMoney(ed.amount), category: ed.category, method: ed.method, person: s.viewer };
  if (ed.type === 'expense') {
    tpl.scope = ed.scope;
    if (ed.scope === 'personal') tpl.paidFrom = s.viewer; else { tpl.paidFrom = ed.paid === 'joint' ? 'joint' : s.viewer; tpl.shareMax = ed.shareMax; }
  } else tpl.wallet = ed.wallet === 'joint' ? 'joint' : s.viewer;
  if (ed.note.trim()) tpl.note = ed.note.trim();
  if (ed.hidden) tpl.hidden = true;
  return tpl;
}

function editorHtml(s) {
  const cats = ed.type === 'income' ? [...INCOME_CATEGORIES, ...(s.categories.income || [])] : [...EXPENSE_CATEGORIES, ...(s.categories.expense || [])];
  if (!cats.includes(ed.category)) ed.category = cats[0];
  const shared = ed.type === 'expense' && ed.scope === 'shared';
  return `${subHeader(ed.id ? 'Изменить шаблон' : 'Новый шаблон')}<div class="tpl-ed">
    <label class="l" for="t-title">Название</label><input id="t-title" maxlength="30" placeholder="Например, Кофе" value="${esc(ed.title)}" autocomplete="off">
    <label class="l" style="margin-top:14px">Тип</label>${seg('type', [['expense', 'Расход'], ['income', 'Доход']], ed.type, 'Тип')}
    <div class="card amount" style="margin-top:12px"><input id="t-amount" inputmode="decimal" placeholder="0" value="${esc(ed.amount)}" aria-label="Сумма"><span>${esc(s.settings.currency)}</span></div>
    <label class="l" for="t-cat">Категория</label><select id="t-cat">${cats.map((c) => `<option ${c === ed.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    ${ed.type === 'expense' ? `<label class="l">Чья это трата</label>${seg('scope', [['personal', 'Личная'], ['shared', 'Общая']], ed.scope, 'Чья это трата')}` : ''}
    ${shared ? `<label class="l">Откуда деньги</label>${seg('paid', [['me', 'Мой кошелёк'], ['joint', 'Общий баланс']], ed.paid, 'Откуда деньги')}
      <label class="l" for="t-share" id="t-sharelab">Доля: ${esc(nameOf('max'))} ${ed.shareMax}% · ${esc(nameOf('dinara'))} ${100 - ed.shareMax}%</label><input type="range" id="t-share" min="0" max="100" step="5" value="${ed.shareMax}">` : ''}
    ${ed.type === 'income' ? `<label class="l">Куда придут деньги</label>${seg('wallet', [['me', 'Мой кошелёк'], ['joint', 'Общий баланс']], ed.wallet, 'Куда придут деньги')}` : ''}
    <label class="l">Способ</label>${seg('method', [['card', 'Карта'], ['cash', 'Наличные']], ed.method, 'Способ')}
    <label class="l" for="t-note">Заметка</label><input id="t-note" placeholder="Необязательно" value="${esc(ed.note)}">
    <label class="switch"><span>Скрыть детали от партнёра<br><span class="muted sm">Будет видна только сумма</span></span><input type="checkbox" id="t-hidden" ${ed.hidden ? 'checked' : ''}></label>
    ${err ? `<div class="error" role="alert">${esc(err)}</div>` : ''}
    <button class="primary" id="t-save">${ed.id ? 'Сохранить' : 'Создать шаблон'}</button>
    <button class="ghost" id="t-cancel" style="margin-top:10px;text-align:center">Отмена</button></div>`;
}

function shortcutsHtml(s) {
  const base = baseUrl(), first = s.templates[0]?.title || 'Кофе';
  const add = buildQuickLink(base, { amount: '450', cat: 'Продукты', scope: 'shared', method: 'card', note: 'Кофе' });
  const tpl = buildQuickLink(base, { tpl: first });
  const dec = (u) => { try { return decodeURIComponent(u); } catch { return u; } };
  const linkBox = (id, label, u) => `<div class="lbox"><span class="muted sm">${label}</span><code id="${id}" tabindex="0">${esc(dec(u))}</code><button type="button" class="chip" data-copy="${esc(u)}" aria-label="Скопировать ссылку: ${esc(label)}">${ic('qcopy')} Скопировать</button></div>`;
  return `<section class="card shortcuts" aria-labelledby="sc-h"><h3 id="sc-h">${ic('qphone')} Команды iPhone</h3>
    <p class="muted sm">Команда из приложения «Команды» откроет форму с готовой суммой — например, по кнопке на экране «Домой» или голосом через Siri.</p>
    <ol class="steps">
      <li>Откройте приложение «Команды» → «+» (новая команда).</li>
      <li>Добавьте действие <b>«Открыть URL»</b> и вставьте скопированную ссылку ниже.</li>
      <li>Чтобы вводить сумму каждый раз, перед ним добавьте <b>«Запросить ввод»</b> (тип «Число») и подставьте её в ссылку вместо <code>450</code>.</li>
      <li>Назовите команду, например «Трата», и добавьте на экран «Домой» через «Поделиться».</li>
    </ol>
    ${linkBox('sc-add', 'Открыть форму с заготовкой', add)}
    ${linkBox('sc-tpl', 'Сразу добавить из шаблона', tpl)}
    <p class="muted sm"><b>Параметры</b> (все необязательные): <code>add</code> — сумма в рублях; <code>cat</code> — категория; <code>scope</code> — <code>shared</code> или <code>personal</code>; <code>method</code> — <code>card</code> или <code>cash</code>; <code>note</code> — заметка; <code>tpl</code> — название шаблона (добавит операцию сразу).</p>
    <p class="muted sm">Важно: ссылка откроется в Safari. Если приложение стоит на экране «Домой», его данные отделены от Safari — для общей картины включите синхронизацию (Ещё → Синхронизация) и пользуйтесь одним способом.</p></section>`;
}

export default {
  render(s, a) {
    if (ed) return editorHtml(s);
    const list = s.templates.filter((x) => x && x.tpl);
    const sug = suggestTemplates(s.txs, a.today(), s.templates, s.viewer).slice(0, 3);
    const sugHtml = sug.length ? `<section class="card tpl-sug" aria-label="Подсказки"><div class="row whead"><b>${ic('bulb')} Часто повторяется</b></div>${sug.map((x, i) => `<div class="sg"><span>${tile(x.category)}</span><div class="g"><b>${esc(x.category)} · ${fm(x.amount)}</b><div class="muted sm">${x.count} ${plural(x.count, 'раз', 'раза', 'раз')} за 3 месяца${x.tpl.note ? ` · ${esc(x.tpl.note)}` : ''}</div></div><button type="button" class="chip" data-sug="${i}">Сделать шаблоном</button></div>`).join('')}</section>` : '';
    const tiles = list.length ? `<div class="tpl-grid">${list.map((x) => {
      const t = x.tpl, amt = `${t.type === 'income' ? '+' : ''}${fm(t.amount)}`;
      return `<div class="tpl-card"><button type="button" class="tpl-main" data-add="${esc(x.id)}" aria-label="Добавить сегодня: ${esc(x.title)}, ${esc(amt)}">${tile(t.category)}<b>${esc(x.title)}</b><span class="muted sm">${esc(amt)}${t.scope === 'personal' ? ' · лично' : t.type === 'expense' ? ' · общее' : ''}</span></button>
        <div class="tpl-act"><button type="button" class="ib" data-form="${esc(x.id)}" aria-label="Открыть форму: ${esc(x.title)}">${ic('more')}</button><button type="button" class="ib" data-edit="${esc(x.id)}" aria-label="Изменить шаблон: ${esc(x.title)}">${ic('edit')}</button><button type="button" class="ib" data-del="${esc(x.id)}" aria-label="Удалить шаблон: ${esc(x.title)}">${ic('trash')}</button></div></div>`;
    }).join('')}</div>` : `<div class="empty card"><div class="big">${ic('qbolt')}</div><b>Шаблонов пока нет</b><span class="muted">Создайте шаблон для частой траты — кофе, обед, проезд — и добавляйте её одним касанием прямо с главной.</span></div>`;
    return `${subHeader('Быстрые шаблоны')}<div class="stack">${sugHtml}${tiles}<button class="primary" id="t-new" style="margin-top:0">${ic('plus')} Новый шаблон</button>${shortcutsHtml(s)}</div>`;
  },
  bind(root, s, a) {
    const byId = (id) => s.templates.find((x) => x.id === id);
    if (ed) {
      $$('[data-ed]', root).forEach((b) => (b.onclick = () => {
        readEd(); const k = b.dataset.ed, v = b.dataset.v; ed[k] = v; err = '';
        if (k === 'type') ed.category = v === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
        a.render();
      }));
      const sh = $('#t-share', root); if (sh) sh.oninput = () => { ed.shareMax = +sh.value; $('#t-sharelab').textContent = `Доля: ${nameOf('max')} ${ed.shareMax}% · ${nameOf('dinara')} ${100 - ed.shareMax}%`; };
      $('#t-cancel', root).onclick = () => { ed = null; err = ''; a.render(); };
      $('#t-save', root).onclick = () => {
        readEd();
        const title = ed.title.trim().slice(0, 30), tpl = tplFromEd(s);
        if (!title) err = 'Введите название шаблона';
        else if (!tpl.amount) err = 'Сумма должна быть больше нуля';
        else if (s.templates.some((x) => x.id !== ed.id && x.title.trim().toLowerCase() === title.toLowerCase())) err = 'Шаблон с таким названием уже есть';
        else err = templateErrors(tpl, s.viewer)[0] || '';
        if (err) return a.render();
        const id = ed.id;
        a.store.mutate((x) => { if (id) { const it = x.templates.find((z) => z.id === id); if (it) { it.title = title; it.tpl = tpl; } } else x.templates.push({ id: crypto.randomUUID(), title, tpl }); });
        ed = null; a.toast(id ? 'Шаблон сохранён' : `Шаблон «${title}» создан`);
      };
      return;
    }
    $('#t-new', root).onclick = () => { openEditor(null, s); a.render(); setTimeout(() => $('#t-title')?.focus(), 0); };
    $$('[data-add]', root).forEach((b) => (b.onclick = () => { const it = byId(b.dataset.add); if (it) quickAdd(it, a); }));
    $$('[data-form]', root).forEach((b) => (b.onclick = () => { const it = byId(b.dataset.form); if (it) { startWith(draftFromTemplate(it, s.viewer), s); a.go('add', { keepDraft: true }); } }));
    $$('[data-edit]', root).forEach((b) => (b.onclick = () => { const it = byId(b.dataset.edit); if (it) { openEditor(it, s); a.render(); window.scrollTo(0, 0); } }));
    $$('[data-del]', root).forEach((b) => (b.onclick = () => {
      const it = byId(b.dataset.del); if (!it) return;
      const idx = s.templates.indexOf(it);
      a.store.mutate((x) => { x.templates = x.templates.filter((z) => z.id !== it.id); });
      a.toast(`Шаблон «${it.title}» удалён`, { label: 'Отменить', fn: () => a.store.mutate((x) => { if (!x.templates.some((z) => z.id === it.id)) x.templates.splice(Math.min(idx, x.templates.length), 0, it); }) });
    }));
    const sug = suggestTemplates(s.txs, a.today(), s.templates, s.viewer).slice(0, 3);
    $$('[data-sug]', root).forEach((b) => (b.onclick = () => {
      const x = sug[+b.dataset.sug]; if (!x) return;
      const title = (x.tpl.note || x.category).slice(0, 30);
      a.store.mutate((z) => { z.templates.push({ id: crypto.randomUUID(), title, tpl: x.tpl }); });
      a.toast(`Шаблон «${title}» создан`);
    }));
    $$('[data-copy]', root).forEach((b) => (b.onclick = async () => {
      const ok = await copyText(b.dataset.copy);
      a.toast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать — выделите ссылку вручную');
    }));
  },
  leave() { ed = null; err = ''; },
};
