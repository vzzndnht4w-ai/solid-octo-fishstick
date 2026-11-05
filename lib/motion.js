// Анимации интерфейса. При «уменьшить движение» всё показывается сразу, без анимации.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
