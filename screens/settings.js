// Настройки: тема, валюта, общие траты, автоблокировка, свои категории, повтор знакомства.
import { subHeader, esc, ic, $, $$ } from '../core.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PEOPLE } from '../ledger.js';
import { applyTheme } from '../lib/appearance.js';
import { seg, group, row, ctl } from '../lib/ui.js';

const CURRENCIES = ['₽', '$', '€', '£', '₸', '₴'];
const LOCKS = [[0, 'Выкл.'], [1, '1 мин'], [5, '5 мин'], [15, '15 мин']];
const KINDS = [['expense', 'Категории расходов', 'tag', EXPENSE_CATEGORIES], ['income', 'Категории доходов', 'coins', INCOME_CATEGORIES]];
const CAT_MAX = 24;
let confirmReset = false;

const shareText = (v) => `Как делим: ${PEOPLE.max} ${v}% · ${PEOPLE.dinara} ${100 - v}%`;

const catBlock = ([kind, label, icon, base], s) => {
  const mine = s.categories[kind] || [];
  return `<div class="srow col"><div class="top2"><span class="tile sm" style="--h:${kind === 'income' ? '#2aa874' : '#e2a63c'}">${ic(icon)}</span><span class="lbl"><b>${label}</b><small>Свои — с иконкой «Другое». Старые операции не меняются.</small></span></div>
    <ul class="cchips" aria-label="${label}">${base.map((c) => `<li class="cc base">${esc(c)}</li>`).join('')}${mine.map((c, i) => `<li class="cc mine">${esc(c)}<button type="button" data-delcat="${kind}:${i}" aria-label="Удалить категорию «${esc(c)}»">${ic('x')}</button></li>`).join('')}</ul>
    <form class="addrow" data-addcat="${kind}" novalidate><label class="sr" for="nc-${kind}">Новая категория</label><input id="nc-${kind}" class="txt" placeholder="Новая категория" maxlength="${CAT_MAX}" autocomplete="off" data-fk="nc-${kind}"><button type="submit" class="chip on addbtn" data-fk="nc-add-${kind}">Добавить</button></form>
    <p class="ferr" id="err-${kind}" role="alert"></p></div>`;
};

export default {
  render(s) {
    const st = s.settings, share = st.defaultShare ?? 50;
    return `${subHeader('Настройки')}<div class="stack">
    ${group('Внешний вид',
      ctl({ icon: 'sun', hue: '#e2a63c', label: 'Тема', control: seg('theme', [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']], st.theme || 'auto', 'Тема оформления') })
      + ctl({ icon: 'globe', hue: '#36b0d4', label: 'Валюта', sub: 'Символ в суммах по всему приложению', control: `<div class="chips s-cur" role="group" aria-label="Валюта">${CURRENCIES.map((c) => `<button type="button" class="chip${st.currency === c ? ' on' : ''}" data-cur="${c}" data-fk="cur-${c}" aria-pressed="${st.currency === c}" aria-label="${c}">${c}</button>`).join('')}</div>` }))}
    ${group('Общие траты',
      ctl({ icon: 'pie', hue: '#9a6cff', label: 'Доля по умолчанию', sub: 'Подставляется в новую общую трату', control: `<p class="sharelab" id="s-sharelab" aria-live="polite">${esc(shareText(share))}</p><input type="range" id="s-share" min="0" max="100" step="5" value="${share}" aria-label="Доля ${esc(PEOPLE.max)} в процентах" aria-valuetext="${share}%"><div class="chips mt"><button type="button" class="chip" data-share="50">50/50</button><button type="button" class="chip" data-share="60">60/40</button><button type="button" class="chip" data-share="70">70/30</button></div>` })
      + ctl({ icon: 'users', hue: '#2aa874', label: 'Делить общее по доходам', sub: 'Доля в новой общей трате — по доходам за последние 3 месяца', control: seg('splitInc', [['0', 'Выкл.'], ['1', 'Вкл.']], st.splitByIncome ? '1' : '0', 'Делить общее по доходам') })
      + ctl({ icon: 'card', hue: '#4f86f0', label: 'Способ оплаты по умолчанию', control: seg('method', [['card', `${ic('card')} Карта`], ['cash', `${ic('cash')} Наличные`]], st.defaultMethod || 'card', 'Способ оплаты по умолчанию') }))}
    ${group('Безопасность',
      ctl({ icon: 'timer', hue: '#ef8a45', label: 'Автоблокировка', sub: 'Через сколько после ухода в фон спрашивать PIN-код', control: seg('lock', LOCKS, st.autoLockMin ?? 1, 'Автоблокировка') })
      + row({ icon: 'shield', hue: '#2aa874', label: 'PIN-код', sub: 'Установить, сменить или отключить', value: st.pins?.[s.viewer] ? 'Включён' : 'Не задан', go: 'profile', fk: 'go-pin' }),
      'Приложение всегда просит PIN при запуске, если он задан. «Выкл.» — не блокировать при возврате из фона.')}
    ${group('Свои категории', KINDS.map((k) => catBlock(k, s)).join(''))}
    ${group('Профиль', row({ icon: 'users', hue: '#7b6cf0', label: 'Имена, цвета, обращение', go: 'profile', fk: 'go-profile' }))}
    ${group('Знакомство', row({ icon: 'refresh', hue: '#858aa0', label: confirmReset ? 'Точно пройти заново? Нажмите ещё раз' : 'Пройти знакомство заново', sub: 'Операции и цели не удаляются', go: 'reset-onb', fk: 'reset-onb', danger: confirmReset }))}
    </div>`;
  },
  bind(root, s, a) {
    const st = a.store;
    const set = (fn) => st.mutate((x) => fn(x.settings));
    $$('[data-seg]', root).forEach((b) => (b.onclick = () => {
      const v = b.dataset.v, k = b.dataset.seg;
      if (k === 'theme') { applyTheme(v); set((z) => { z.theme = v; }); }
      if (k === 'method') set((z) => { z.defaultMethod = v; });
      if (k === 'lock') set((z) => { z.autoLockMin = +v; });
      if (k === 'splitInc') set((z) => { z.splitByIncome = v === '1'; });
    }));
    $$('[data-cur]', root).forEach((b) => (b.onclick = () => set((z) => { z.currency = b.dataset.cur; })));

    const range = $('#s-share', root), lab = $('#s-sharelab', root);
    const preview = () => { lab.textContent = shareText(+range.value); range.setAttribute('aria-valuetext', `${range.value}%`); };
    range.oninput = preview;
    range.onchange = () => set((z) => { z.defaultShare = +range.value; });
    $$('[data-share]', root).forEach((b) => (b.onclick = () => set((z) => { z.defaultShare = +b.dataset.share; })));

    $$('[data-addcat]', root).forEach((f) => (f.onsubmit = (e) => {
      e.preventDefault();
      const kind = f.dataset.addcat, input = $('input', f), err = $('#err-' + kind, root);
      const name = input.value.trim().replace(/\s+/g, ' ');
      const base = KINDS.find((k) => k[0] === kind)[3];
      const all = [...base, ...(s.categories[kind] || [])].map((c) => c.toLowerCase());
      const fail = (m) => { err.textContent = m; input.setAttribute('aria-invalid', 'true'); input.focus(); };
      if (!name) return fail('Введите название категории');
      if (all.includes(name.toLowerCase())) return fail('Такая категория уже есть');
      st.mutate((x) => { x.categories[kind] = [...(x.categories[kind] || []), name]; });
      a.toast(`Категория «${name}» добавлена`);
    }));
    $$('[data-delcat]', root).forEach((b) => (b.onclick = () => {
      const [kind, i] = b.dataset.delcat.split(':'), idx = +i, name = s.categories[kind][idx];
      st.mutate((x) => { x.categories[kind].splice(idx, 1); });
      a.toast(`Категория «${name}» удалена`, { label: 'Отменить', fn: () => st.mutate((x) => { if (!x.categories[kind].includes(name)) x.categories[kind].splice(idx, 0, name); }) });
    }));

    $$('[data-go]', root).forEach((b) => (b.onclick = () => {
      const g = b.dataset.go;
      if (g === 'profile') return a.go('profile');
      if (g === 'reset-onb') {
        if (!confirmReset) { confirmReset = true; a.render(); setTimeout(() => { if (confirmReset) { confirmReset = false; if (a.route === 'settings') a.render(); } }, 4000); return; }
        confirmReset = false; set((z) => { z.onboarded = false; });
      }
    }));
  },
};
