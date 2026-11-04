// Знакомство при первом запуске: имена и обращение → кто вы → как делите общее.
import { esc, ic, money as fm, $, $$ } from '../core.js';
import { seg } from '../lib/ui.js';

const NAME_MAX = 20;
const STEPS = 3;
let step = 1, d = null, moved = false, err = '';

const init = (s) => {
  if (d) return;
  d = {
    name: { max: s.profiles.max.name, dinara: s.profiles.dinara.name },
    female: { max: !!s.profiles.max.female, dinara: !!s.profiles.dinara.female },
    me: s.viewer || null,
    share: s.settings.defaultShare ?? 50,
  };
};
const nm = (p) => d.name[p].trim() || (p === 'max' ? 'Первый' : 'Вторая');

const dots = () => `<div class="ob-dots" role="img" aria-label="Шаг ${step} из ${STEPS}">${Array.from({ length: STEPS }, (_, i) => `<i class="${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}"></i>`).join('')}</div>`;

const personCard = (p) => `<div class="ob-card ${p}"><span class="av ${p} lg" id="ob-av-${p}">${esc((d.name[p].trim()[0] || '?').toUpperCase())}</span>
  <div class="ob-f"><label class="fl" for="ob-${p}">${p === 'max' ? 'Первый человек' : 'Второй человек'}</label>
  <input id="ob-${p}" class="txt" value="${esc(d.name[p])}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" placeholder="Имя"></div>
  ${seg('g-' + p, [['false', 'Он'], ['true', 'Она']], String(d.female[p]), `Пол: ${nm(p)}`)}</div>`;

const stepBody = () => {
  if (step === 1) return `<h1 id="ob-h" tabindex="-1">Как вас зовут?</h1><p class="muted">Имена видны в ленте, на главной и в формах. Пол нужен для окончаний: «заработал» или «заработала».</p>
    <div class="stack">${personCard('max')}${personCard('dinara')}</div>${err ? `<p class="ferr" role="alert">${esc(err)}</p>` : ''}`;
  if (step === 2) return `<h1 id="ob-h" tabindex="-1">Кто сейчас с телефоном?</h1><p class="muted">Это можно поменять в любой момент кнопкой «Я — другой». У каждого может быть свой PIN-код.</p>
    <div class="stack" role="radiogroup" aria-label="Кто вы">${['max', 'dinara'].map((p) => `<button type="button" role="radio" aria-checked="${d.me === p}" class="ob-who ${p}${d.me === p ? ' on' : ''}" data-me="${p}" data-fk="me-${p}"><span class="av ${p} lg">${esc((d.name[p].trim()[0] || '?').toUpperCase())}</span><b>Я — ${esc(nm(p))}</b><span class="tick">${ic('check')}</span></button>`).join('')}</div>${err ? `<p class="ferr" role="alert">${esc(err)}</p>` : ''}`;
  const a = Math.round((100000 * d.share) / 100);
  return `<h1 id="ob-h" tabindex="-1">Как делите общее?</h1><p class="muted">Эта доля подставляется в каждую общую трату. В любой момент её можно поменять прямо в форме.</p>
    <div class="card ob-share"><p class="sharelab" id="ob-sharelab" aria-live="polite">${esc(nm('max'))} ${d.share}% · ${esc(nm('dinara'))} ${100 - d.share}%</p>
    <input type="range" id="ob-share" min="0" max="100" step="5" value="${d.share}" aria-label="Доля ${esc(nm('max'))} в процентах">
    <div class="chips mt"><button type="button" class="chip" data-share="50">50/50</button><button type="button" class="chip" data-share="60">60/40</button><button type="button" class="chip" data-share="70">70/30</button></div>
    <div class="preview" id="ob-prev">Пример, чек на 1 000: ${esc(nm('max'))} <b>${fm(a)}</b> · ${esc(nm('dinara'))} <b>${fm(100000 - a)}</b></div></div>`;
};

export default {
  render(s) {
    init(s);
    return `<div class="ob"><div class="ob-top"><span class="ob-logo">${ic('users')}</span><span class="muted sm">Знакомство</span>${dots()}</div>
    <div class="ob-body">${stepBody()}</div>
    <div class="ob-nav">${step > 1 ? '<button type="button" class="ghost ob-back" data-ob="back">Назад</button>' : ''}<button type="button" class="primary ob-next" data-ob="next">${step === STEPS ? 'Начать' : 'Далее'}</button></div></div>`;
  },
  bind(root, s, a) {
    const go = (n) => { step = n; err = ''; moved = true; a.render(); window.scrollTo(0, 0); };
    ['max', 'dinara'].forEach((p) => {
      const el = $('#ob-' + p, root);
      if (el) el.oninput = () => { d.name[p] = el.value; const av = $('#ob-av-' + p, root); if (av) av.textContent = (el.value.trim()[0] || '?').toUpperCase(); };
    });
    $$('[data-seg]', root).forEach((b) => (b.onclick = () => { d.female[b.dataset.seg.slice(2)] = b.dataset.v === 'true'; a.render(); }));
    $$('[data-me]', root).forEach((b) => (b.onclick = () => { d.me = b.dataset.me; err = ''; a.render(); }));
    const range = $('#ob-share', root);
    if (range) {
      const paint = () => {
        d.share = +range.value;
        $('#ob-sharelab', root).textContent = `${nm('max')} ${d.share}% · ${nm('dinara')} ${100 - d.share}%`;
        const x = Math.round((100000 * d.share) / 100);
        $('#ob-prev', root).innerHTML = `Пример, чек на 1 000: ${esc(nm('max'))} <b>${fm(x)}</b> · ${esc(nm('dinara'))} <b>${fm(100000 - x)}</b>`;
      };
      range.oninput = paint;
      $$('[data-share]', root).forEach((b) => (b.onclick = () => { range.value = b.dataset.share; paint(); }));
    }
    $('[data-ob="back"]', root)?.addEventListener('click', () => go(step - 1));
    $('[data-ob="next"]', root).onclick = () => {
      if (step === 1) {
        const [x, y] = [d.name.max.trim(), d.name.dinara.trim()];
        if (!x || !y) { err = 'Впишите оба имени'; moved = true; a.render(); return; }
        if (x.toLowerCase() === y.toLowerCase()) { err = 'Имена должны отличаться'; moved = true; a.render(); return; }
        return go(2);
      }
      if (step === 2) { if (!d.me) { err = 'Выберите, кто вы'; moved = true; a.render(); return; } return go(3); }
      a.store.mutate((x) => {
        for (const p of ['max', 'dinara']) { x.profiles[p].name = d.name[p].trim().slice(0, NAME_MAX); x.profiles[p].female = d.female[p]; }
        x.viewer = d.me; x.settings.defaultShare = d.share; x.settings.onboarded = true;
      });
      step = 1; d = null; err = '';
      a.toast('Готово! Всё это можно поменять в настройках');
    };
    if (moved) { moved = false; $('#ob-h', root)?.focus({ preventScroll: true }); }
  },
};
