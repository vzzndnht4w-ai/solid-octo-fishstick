// Тема и цвета профилей. Применяется к <html> и одному служебному <style>.
// light/dark: [основная заливка, светлый тон для полосок]. Текст на заливке — белый или тёмный (≥4.5:1), см. onColor.
export const ACCENTS = {
  emerald: { label: 'Изумруд', light: ['#138050', '#3dbd7d'], dark: ['#3dbd7d', '#6fd9a0'] },
  mist:    { label: 'Лаванда', light: ['#675c8a', '#9a8fc0'], dark: ['#d8d3e6', '#b9b2d0'] },
  gold:    { label: 'Золото',  light: ['#7d5906', '#d4a93f'], dark: ['#d4a93f', '#e6c453'] },
  teal:    { label: 'Бирюза',  light: ['#0f766f', '#4cc4b8'], dark: ['#4cc4b8', '#7fd9cf'] },
  clay:    { label: 'Глина',   light: ['#a34e38', '#d98a72'], dark: ['#e08f76', '#efb09c'] },
  steel:   { label: 'Сталь',   light: ['#456a8f', '#7f9fc0'], dark: ['#8fb0d4', '#b3cce4'] },
};
export const DEFAULT_COLORS = { max: 'emerald', dinara: 'mist' };

// Старые имена (синий/розовый дизайн) → ближайшие новые.
const LEGACY = { blue: 'emerald', rose: 'mist', violet: 'mist', green: 'emerald', orange: 'gold' };

/** Любое сохранённое значение → ключ из ACCENTS (или '' если не распознано). */
export const normalizeColor = (key) => (ACCENTS[key] ? key : LEGACY[key] || '');

/** Приводит цвета профилей к новому набору; у двоих цвета всегда разные. Возвращает новый объект profiles. */
export function migrateColors(profiles) {
  const out = { max: { ...profiles.max }, dinara: { ...profiles.dinara } };
  out.max.color = normalizeColor(out.max.color) || DEFAULT_COLORS.max;
  out.dinara.color = normalizeColor(out.dinara.color) || DEFAULT_COLORS.dinara;
  if (out.max.color === out.dinara.color) {
    out.dinara.color = Object.keys(ACCENTS).find((k) => k !== out.max.color && k !== DEFAULT_COLORS.max) || 'mist';
  }
  return out;
}

export const accentOf = (key) => ACCENTS[normalizeColor(key) || 'emerald'];

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Контраст двух цветов #rrggbb (1…21). */
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const INK = '#0d1210';
/** Цвет текста на заливке: белый или тёмный — какой контрастнее. */
export const onColor = (fill) => (contrast(fill, '#ffffff') >= contrast(fill, INK) ? '#ffffff' : INK);

const THEMES = ['auto', 'light', 'dark'];
const BAR = { light: '#f2f5f4', dark: '#0c0b10' };
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
/** Цвета профилей → --max/--max2/--on-max и --dinara/--dinara2/--on-dinara (со своими тонами для тёмной темы). */
export function applyAccents(profiles) {
  const pick = (p) => accentOf(profiles?.[p]?.color || DEFAULT_COLORS[p]);
  const vars = (mode) => ['max', 'dinara'].map((p) => { const [a, b] = pick(p)[mode]; return `--${p}:${a};--${p}2:${b};--on-${p}:${onColor(a)};`; }).join('');
  const css = `:root{${vars('light')}}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${vars('dark')}}}`
    + `:root[data-theme="dark"]{${vars('dark')}}`;
  if (css === lastCss) return;
  lastCss = css;
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'profile-colors'; document.head.appendChild(styleEl); }
  styleEl.textContent = css;
}
