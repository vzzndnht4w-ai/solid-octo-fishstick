// Небольшие помощники анимации. При «уменьшить движение» всё показывается сразу, без анимации.
const ease = (k) => 1 - (1 - k) ** 4;

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Плавно «накручивает» число в элементе. format(n) → строка (по умолчанию целое), suffix дописывается в конец. */
export function countUp(el, to, { suffix = '', ms = 1000, format = (n) => String(Math.round(n)), from = 0 } = {}) {
  cancelAnimationFrame(el._raf);
  const show = (v) => { el.textContent = format(v) + suffix; };
  if (reduced() || ms <= 0) return show(to);
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    show(from + (to - from) * ease(k));
    if (k < 1 && el.isConnected) el._raf = requestAnimationFrame(tick);
  };
  tick(t0);
}

/** Каскадное появление: каждому элементу контейнера по селектору — своя задержка (CSS-класс .rise). */
export function stagger(container, selector) {
  if (reduced()) return;
  container.querySelectorAll(selector).forEach((el, i) => {
    const done = (e) => { if (e.target === el) { el.classList.remove('rise'); el.removeEventListener('animationend', done); } };
    el.style.setProperty('--i', i);
    el.classList.add('rise');
    el.addEventListener('animationend', done);
  });
}

/** Заполняет кольцо (SVG circle) на долю frac от 0 до 1. */
export function ringFill(circle, frac, { ms = 1100 } = {}) {
  const len = 2 * Math.PI * circle.r.baseVal.value, to = len * (1 - Math.max(0, Math.min(1, frac)));
  circle.style.strokeDasharray = len;
  if (reduced()) { circle.style.strokeDashoffset = to; return; }
  circle.style.strokeDashoffset = len;
  circle.getBoundingClientRect();
  circle.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.2,.8,.2,1)`;
  circle.style.strokeDashoffset = to;
}
