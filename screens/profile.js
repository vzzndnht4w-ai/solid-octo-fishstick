// Профиль: имя, обращение (окончания), цвет-акцент, PIN-код. Имена обоих видны во всём приложении.
import { subHeader, av, esc, $, $$ } from '../core.js';
import { ACCENTS } from '../lib/appearance.js';
import { createPinRecord } from '../lib/pin.js';
import { seg, group, row } from '../lib/ui.js';
import { askNewPin, confirmPin } from './lock.js';

const NAME_MAX = 20;
const other = (p) => (p === 'max' ? 'dinara' : 'max');

const swatches = (s, me) => `<div class="swatches" role="group" aria-label="Цвет профиля">${Object.entries(ACCENTS).map(([k, c]) => {
  const mine = s.profiles[me].color === k, takenBy = s.profiles[other(me)].color === k;
  return `<button type="button" class="swatch${mine ? ' on' : ''}" data-color="${k}" data-fk="color-${k}" style="--c1:${c.light[0]};--c2:${c.light[1]};--d1:${c.dark[0]};--d2:${c.dark[1]}" aria-pressed="${mine}" ${takenBy ? `disabled title="Занят: ${esc(s.profiles[other(me)].name)}"` : ''} aria-label="${esc(c.label)}${takenBy ? ' (занят партнёром)' : ''}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>`;
}).join('')}</div>`;

const nameField = (id, value, label) => `<div class="srow col"><label class="fl" for="${id}">${esc(label)}</label><input id="${id}" class="txt" value="${esc(value)}" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" enterkeyhint="done"></div>`;

const genderSeg = (name, female, who) => seg(name, [['false', 'заработал'], ['true', 'заработала']], String(!!female), `Окончания для ${who}`);

export default {
  render(s) {
    const me = s.viewer, pt = other(me), P = s.profiles, hasPin = !!s.settings.pins?.[me];
    const demo = `${esc(P[me].name)} ${P[me].female ? 'заработала' : 'заработал'} и ${P[me].female ? 'потратила' : 'потратил'}`;
    return `${subHeader('Профиль')}<div class="stack">
    <section class="pf-hero ${me}">${av(me, 'xl')}<div><b id="pf-title">${esc(P[me].name)}</b><span>Мой профиль</span></div></section>
    ${group('Имя', nameField('pf-name', P[me].name, 'Как вас зовут'), 'Имя показывается на главной, в ленте и в формах.')}
    ${group('Обращение', `<div class="srow col">${genderSeg('gender', P[me].female, P[me].name)}<p class="gdemo" aria-live="polite">${demo}</p></div>`, 'Нужно для правильных окончаний: «заработал» или «заработала».')}
    ${group('Цвет', `<div class="srow col">${swatches(s, me)}</div>`, 'Цвет аватара и ваших цифр. Цвет партнёра занят.')}
    ${group('PIN-код', hasPin
      ? row({ icon: 'shield', hue: '#2aa874', label: 'PIN-код включён', sub: 'Спрашивается при запуске и после паузы' }) + row({ icon: 'lock', hue: '#7b6cf0', label: 'Заблокировать сейчас', go: 'lock-now', fk: 'lock-now' }) + row({ icon: 'edit', label: 'Сменить PIN-код', go: 'pin-change', fk: 'pin-change' }) + row({ icon: 'x', hue: '#e0445a', label: 'Отключить PIN-код', go: 'pin-off', fk: 'pin-off', danger: true })
      : row({ icon: 'lock', hue: '#858aa0', label: 'Защитить профиль', sub: '4 цифры, у каждого свой', go: 'pin-set', fk: 'pin-set' }),
    'Хранится только хэш, сам PIN нигде не записывается. Время автоблокировки — в настройках.')}
    ${group('Второй профиль', `${nameField('pf-pname', P[pt].name, 'Имя партнёра')}<div class="srow col">${genderSeg('pgender', P[pt].female, P[pt].name)}</div>`)}
    </div>`;
  },
  bind(root, s, a) {
    const me = s.viewer, pt = other(me), st = a.store;
    const setName = (who, input) => {
      const v = input.value.trim().slice(0, NAME_MAX);
      if (!v) { input.value = s.profiles[who].name; a.toast('Имя не может быть пустым'); return; }
      if (v !== s.profiles[who].name) st.mutate((x) => { x.profiles[who].name = v; });
    };
    [['#pf-name', me], ['#pf-pname', pt]].forEach(([sel, who]) => {
      const el = $(sel, root);
      el.onchange = () => setName(who, el);
      el.onkeydown = (e) => { if (e.key === 'Enter') el.blur(); };
      if (who === me) el.oninput = () => { // живой предпросмотр аватара и заголовка
        const v = el.value.trim();
        $('.pf-hero .av', root).textContent = (v[0] || '?').toUpperCase();
        $('#pf-title', root).textContent = v || s.profiles[me].name;
      };
    });
    $$('[data-seg]', root).forEach((b) => (b.onclick = () => {
      const who = b.dataset.seg === 'gender' ? me : pt;
      st.mutate((x) => { x.profiles[who].female = b.dataset.v === 'true'; });
    }));
    $$('[data-color]', root).forEach((b) => (b.onclick = () => st.mutate((x) => { x.profiles[me].color = b.dataset.color; })));

    const setPin = async () => {
      const pin = await askNewPin(me, s.profiles[me].name);
      if (!pin) return;
      const rec = await createPinRecord(pin);
      st.mutate((x) => { x.settings.pins[me] = rec; });
      a.toast('PIN-код установлен');
    };
    const act = {
      'pin-set': setPin,
      'lock-now': () => a.lock(),
      'pin-change': async () => { if ((await confirmPin(me, { title: 'Текущий PIN-код', sub: 'Сначала подтвердите, что это вы' })) === true) await setPin(); },
      'pin-off': async () => {
        if ((await confirmPin(me, { title: 'Отключить PIN-код', sub: 'Введите текущий PIN-код' })) !== true) return;
        st.mutate((x) => { delete x.settings.pins[me]; });
        a.toast('PIN-код отключён');
      },
    };
    $$('[data-go]', root).forEach((b) => (b.onclick = () => act[b.dataset.go]()));
  },
};
