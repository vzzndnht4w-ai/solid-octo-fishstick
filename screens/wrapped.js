// «Итоги месяца» в историях: полноэкранные карточки, листаются касанием по краям, свайпом и стрелками.
import { ic, esc, av, catOf, monthLabel, money as fm, MONTHS, $, $$ } from '../core.js';
import { buildStory } from '../lib/play.js';
import '../lib/play-icons.js';

let idx = 0, lastKey = null, keyHandler = null, shareJob = null;
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const story = (s, a) => buildStory(s.txs, a.month, s.viewer, { goals: s.goals, money: fm, female: { max: s.profiles.max.female, dinara: s.profiles.dinara.female } });

const fmtVal = (v, fmt) => (fmt === 'pct' ? `${Math.round(v)}%` : fm(Math.round(v)));
const num = (v, fmt, cls = '') => `<span class="pw-num ${cls}" data-count="${v}" data-fmt="${fmt}">${esc(fmtVal(v, fmt))}</span>`;

function body(c) {
  let h = '';
  const [, hue] = c.category ? catOf(c.category) : [0, ''];
  h += c.category ? `<span class="pw-ic pw-cat" style="--h:${hue}">${ic(catOf(c.category)[0])}</span>` : `<span class="pw-ic">${ic(c.icon)}</span>`;
  h += `<p class="pw-kick">${esc(c.kicker)}</p>`;
  if (c.big) h += `<div class="pw-big">${num(c.big.value, c.big.fmt)}</div>`;
  if (c.text) h += `<h2 class="pw-text">${esc(c.text)}</h2>`;
  if (c.sub) h += `<p class="pw-sub">${esc(c.sub)}</p>`;
  if (c.id === 'numbers') h += `<ul class="pw-rows">${c.rows.map((r) => `<li><span>${esc(r.label)}</span>${num(r.value, r.fmt, 'pw-rowbig')}</li>`).join('')}</ul>`;
  if (c.id === 'payer') h += `<ul class="pw-rows pw-people">${c.rows.map((r) => `<li>${av(r.person, 'sm')}<span>${esc(r.label)}<small>${esc(r.note)}</small></span>${num(r.value, r.fmt)}</li>`).join('')}</ul>`;
  if (c.id === 'goals') h += `<ul class="pw-rows pw-goals">${c.rows.map((r) => `<li><div class="pw-grow"><span class="pw-gemo" aria-hidden="true">${esc(r.emoji || '🎯')}</span><b>${esc(r.label)}</b><em>${Math.round(r.pct * 100)}%</em></div><div class="pw-pbar" role="img" aria-label="${esc(r.label)}: ${Math.round(r.pct * 100)}%"><i style="width:${Math.round(r.pct * 100)}%"></i></div><small>${esc(fm(r.value))} из ${esc(fm(r.target))}${r.done ? ' · достигнута' : ''}</small></li>`).join('')}</ul>`;
  if (c.bars) {
    const max = Math.max(...c.bars.map((b) => b.value), 1);
    const desc = c.bars.map((b) => `${b.label}: ${fm(b.value)}`).join(', ');
    h += `<div class="pw-bars7" role="img" aria-label="Расходы по дням недели. ${esc(desc)}">${c.bars.map((b) => `<div class="${b.top ? 'hi' : ''}"><i style="height:${Math.max(4, Math.round((b.value / max) * 100))}%"></i><span>${esc(b.label)}</span></div>`).join('')}</div>`;
  }
  if (c.id === 'verdict') h += `<button class="pw-share" data-share type="button">${ic('share')} Поделиться</button>`;
  return h;
}

function intro(a, n) {
  return { id: 'intro', theme: 'night', html: `<span class="pw-ic">${ic('sparkle')}</span><p class="pw-kick">Итоги месяца</p><h2 class="pw-text pw-month-big">${esc(MONTHS[+a.month.slice(5) - 1])}<small>${esc(a.month.slice(0, 4))}</small></h2>
    <p class="pw-sub">${n} ${n === 1 ? 'карточка' : n < 5 ? 'карточки' : 'карточек'} о том, как вы жили и тратили вдвоём</p>
    <div class="pw-msw"><button type="button" data-m="-1" aria-label="Предыдущий месяц">${ic('left')}</button><button type="button" data-m="1" aria-label="Следующий месяц">${ic('right')}</button></div>
    <p class="pw-hint">Касайтесь краёв экрана, листайте пальцем или стрелками</p>` };
}

export default {
  render(s, a) {
    const cards = story(s, a);
    const key = `${a.month}|${s.viewer}`;
    if (key !== lastKey) { idx = 0; lastKey = key; shareJob = null; }
    if (!cards.length) {
      return `<div class="pw pw-t-night pw-empty"><div class="pw-top"><span class="pw-pill">${esc(monthLabel(a.month))}</span><button class="pw-x" data-back type="button" aria-label="Закрыть">${ic('x')}</button></div>
        <div class="pw-card on"><span class="pw-ic">${ic('sparkle')}</span><p class="pw-kick">Итоги месяца</p><h2 class="pw-text">Пока нечего показывать</h2><p class="pw-sub">В этом месяце нет операций. Выберите другой месяц или запишите первую трату.</p>
        <div class="pw-msw"><button type="button" data-m="-1" aria-label="Предыдущий месяц">${ic('left')}</button><button type="button" data-m="1" aria-label="Следующий месяц">${ic('right')}</button></div></div></div>`;
    }
    const all = [intro(a, cards.length), ...cards];
    idx = Math.min(idx, all.length - 1);
    return `<div class="pw" role="region" aria-roledescription="карусель" aria-label="Итоги месяца ${esc(monthLabel(a.month))}" data-n="${all.length}">
      <div class="pw-prog" role="progressbar" aria-valuemin="1" aria-valuemax="${all.length}" aria-valuenow="${idx + 1}" aria-label="Карточка ${idx + 1} из ${all.length}">${all.map(() => '<i></i>').join('')}</div>
      <div class="pw-top"><span class="pw-pill">${esc(monthLabel(a.month))}</span><button class="pw-x" data-back type="button" aria-label="Закрыть итоги">${ic('x')}</button></div>
      <div class="pw-stage" aria-live="polite">${all.map((c, i) => `<section class="pw-card pw-t-${c.theme}" data-i="${i}" ${i === idx ? '' : 'hidden'} aria-label="Карточка ${i + 1} из ${all.length}">${c.html || body(c)}<span class="pw-deco" aria-hidden="true">${ic(c.icon || 'sparkle')}</span></section>`).join('')}</div>
      <button class="pw-zone l" type="button" data-prev aria-label="Назад"></button><button class="pw-zone r" type="button" data-next aria-label="Дальше"></button>
    </div>`;
  },

  bind(root, s, a) {
    const box = $('.pw', root);
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
    if (!box) return;
    const cards = story(s, a), n = cards.length + 1;
    const secs = $$('.pw-card', box), bars = $$('.pw-prog i', box), prog = $('.pw-prog', box);

    const countUp = (sec) => {
      $$('[data-count]', sec).forEach((el) => {
        const to = +el.dataset.count, fmt = el.dataset.fmt;
        if (reduced() || !to) { el.textContent = fmtVal(to, fmt); return; }
        const t0 = performance.now(), dur = 1000;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          el.textContent = fmtVal(k === 1 ? to : fmt === 'pct' ? to * e : Math.round((to * e) / 100) * 100, fmt);
          if (k < 1 && el.isConnected) requestAnimationFrame(step);
        };
        el.textContent = fmtVal(0, fmt);
        requestAnimationFrame(step);
      });
    };
    const show = (i, first = false) => {
      i = Math.max(0, Math.min(n - 1, i));
      if (i === idx && !first) return;
      idx = i;
      secs.forEach((el, k) => { el.hidden = k !== idx; el.classList.toggle('on', k === idx); });
      bars.forEach((b, k) => b.classList.toggle('done', k <= idx));
      prog.setAttribute('aria-valuenow', idx + 1); prog.setAttribute('aria-label', `Карточка ${idx + 1} из ${n}`);
      countUp(secs[idx]);
      if (idx === n - 1) prepareShare(cards, a);
    };
    show(idx, true);

    let suppress = 0;
    const go = (d) => { if (Date.now() - suppress > 350) show(idx + d); };
    $('[data-prev]', box).onclick = () => go(-1);
    $('[data-next]', box).onclick = () => go(1);
    let x0 = null;
    box.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    box.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) { suppress = Date.now(); show(idx + (dx < 0 ? 1 : -1)); }
    });
    keyHandler = (e) => {
      if (document.querySelector('.pw-imgview')) { if (e.key === 'Escape') closeImg(); return; }
      if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'Escape') a.back();
    };
    document.addEventListener('keydown', keyHandler);

    const sb = $('[data-share]', box);
    if (sb) sb.onclick = () => doShare(cards, a, sb);
  },

  leave() { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; closeImg(); },
};

// ---------- картинка для «Поделиться» ----------
function shareData(cards, a) {
  const num = cards.find((c) => c.id === 'numbers'), v = cards.find((c) => c.id === 'verdict');
  return { month: monthLabel(a.month), rows: num.rows.map((r) => [r.label, fm(r.value)]), text: v.text, sub: v.sub };
}
const wrap = (ctx, text, x, y, maxW, lh) => {
  let line = '';
  for (const w of String(text).split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
};
/** Рисует итоговую карточку 1080×1350 и возвращает Promise<Blob>. */
export async function renderShareImage(d) {
  try { await document.fonts.load('800 80px Onest'); await document.fonts.load('500 40px Onest'); } catch {}
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), F = 'Onest, -apple-system, system-ui, sans-serif';
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2446c8'); g.addColorStop(0.55, '#6a3fb8'); g.addColorStop(1, '#c2305f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[950, 120, 420, 'rgba(255,152,176,.35)'], [80, 1250, 460, 'rgba(122,169,255,.32)']]) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 44px ${F}`; ctx.globalAlpha = 0.85; ctx.fillText('Мы · итоги месяца', 80, 130);
  ctx.globalAlpha = 1; ctx.font = `800 120px ${F}`; ctx.fillText(d.month.split(' ')[0], 80, 270);
  ctx.globalAlpha = 0.8; ctx.font = `600 52px ${F}`; ctx.fillText(d.month.split(' ')[1] || '', 80, 340);
  ctx.globalAlpha = 0.85; ctx.font = `600 34px ${F}`; ctx.textAlign = 'right'; ctx.fillText('Деньги вдвоём', W - 80, 130); ctx.textAlign = 'left';
  let y = 460;
  d.rows.forEach(([label, val]) => {
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(80, y - 56, W - 160, 136, 34); ctx.fill();
    ctx.globalAlpha = 0.95; ctx.font = `500 36px ${F}`; ctx.fillStyle = '#fff'; ctx.fillText(label, 118, y - 6);
    ctx.globalAlpha = 1; ctx.font = `800 62px ${F}`; ctx.fillText(val, 118, y + 54);
    y += 160;
  });
  ctx.globalAlpha = 1; ctx.font = `800 56px ${F}`;
  y = wrap(ctx, d.text, 80, y + 50, W - 160, 70);
  if (d.sub) { ctx.globalAlpha = 0.92; ctx.font = `500 38px ${F}`; wrap(ctx, d.sub, 80, y + 14, W - 160, 50); }
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'));
}
function prepareShare(cards, a) {
  const key = `${a.month}`;
  if (shareJob?.key === key) return shareJob.p;
  const p = renderShareImage(shareData(cards, a)); p.catch(() => {});
  shareJob = { key, p };
  return p;
}
function closeImg() { const o = document.querySelector('.pw-imgview'); if (o) { URL.revokeObjectURL(o.dataset.url); const f = o._focus; o.remove(); if (f?.isConnected) f.focus(); } }
async function doShare(cards, a, btn) {
  let blob;
  try { blob = await prepareShare(cards, a); } catch { a.toast('Не удалось создать картинку'); return; }
  const file = new File([blob], `my-${a.month}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Итоги: ${monthLabel(a.month)}` }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const o = document.createElement('div');
  o.className = 'pw-imgview'; o.dataset.url = url; o._focus = btn;
  o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Картинка с итогами');
  o.innerHTML = `<img src="${url}" alt="Итоги месяца ${esc(monthLabel(a.month))}: карточка для сохранения"><p>Нажмите на картинку и удерживайте, чтобы сохранить или отправить</p><button type="button" class="pw-close2">Закрыть</button>`;
  document.body.appendChild(o);
  const b = $('button', o); b.onclick = closeImg; b.focus();
  o.onclick = (e) => { if (e.target === o) closeImg(); };
}
