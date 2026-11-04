// Тема и цвета профилей. Применяется к <html> и одному служебному <style>.
export const ACCENTS = {
  blue:   { label: 'Синий',      light: ['#3d6cf2', '#7aa9ff'], dark: ['#5b87f5', '#8db4ff'] },
  rose:   { label: 'Розовый',    light: ['#ec4f7e', '#ff98b0'], dark: ['#f05d8a', '#ffa3bb'] },
  violet: { label: 'Фиолетовый', light: ['#7a55e8', '#b49cff'], dark: ['#8a6cf0', '#b9a8ff'] },
  teal:   { label: 'Бирюзовый',  light: ['#0b8f86', '#4fd1c5'], dark: ['#139f94', '#6fdcd2'] },
  green:  { label: 'Зелёный',    light: ['#2a9d57', '#7ed99c'], dark: ['#2fa862', '#8fe3ac'] },
  orange: { label: 'Оранжевый',  light: ['#e0691f', '#ffb26b'], dark: ['#e0701f', '#ffc08a'] },
};
export const accentOf = (key) => ACCENTS[key] || ACCENTS.blue;
const FALLBACK = { max: 'blue', dinara: 'rose' };

const THEMES = ['auto', 'light', 'dark'];
const BAR = { light: '#f4f1f8', dark: '#0e0c16' };
const baseBars = {};

/** theme: 'auto' | 'light' | 'dark'. */
export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'auto';
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    if (!(i in baseBars)) baseBars[i] = m.content;
    m.content = t === 'auto' ? baseBars[i] : BAR[t];
  });
}

let styleEl;
let lastCss = '';
/** Цвета профилей → CSS-переменные --max/--max2 и --dinara/--dinara2 (со своими тонами для тёмной темы). */
export function applyAccents(profiles) {
  const pick = (p) => accentOf(profiles?.[p]?.color || FALLBACK[p]);
  const vars = (mode) => ['max', 'dinara'].map((p) => { const [a, b] = pick(p)[mode]; return `--${p}:${a};--${p}2:${b};`; }).join('');
  const css = `:root{${vars('light')}}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${vars('dark')}}}`
    + `:root[data-theme="dark"]{${vars('dark')}}`;
  if (css === lastCss) return;
  lastCss = css;
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'profile-colors'; document.head.appendChild(styleEl); }
  styleEl.textContent = css;
}
