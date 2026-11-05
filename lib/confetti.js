// Лёгкое конфетти на canvas без библиотек. До ~1,8 с; при prefers-reduced-motion не показывается.
const COLORS = ['#3dbd7d', '#6fd9a0', '#d8d3e6', '#b9b2d0', '#d4a93f', '#e6c453'];
let running = false;

/** Запустить праздник. Возвращает true, если анимация началась. */
export function celebrate({ count = 140, duration = 1800 } = {}) {
  if (running || typeof document === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  running = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = window.innerWidth, H = window.innerHeight;
  const cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = H * dpr;
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const ps = Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1, ang = -Math.PI / 2 + side * (0.2 + Math.random() * 0.9), v = 9 + Math.random() * 11;
    return { x: W / 2 + side * W * 0.15, y: H * 0.62, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: COLORS[i % COLORS.length] };
  });
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, Math.min(1, (1 - t / duration) * 2.2));
    for (const p of ps) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else { cv.remove(); running = false; }
  };
  requestAnimationFrame(frame);
  return true;
}
