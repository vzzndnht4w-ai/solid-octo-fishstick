import { ic, esc, $, $$ } from '../core.js';
import { parseReceiptQr, receiptDraft, hasReceipt } from '../lib/receipt.js';
import { startWith } from './add.js';

let stream = null, timer = null, jsQRp = null, lastText = '', lastAt = 0;

/** jsQR подключается только когда открыт сканер (130 КБ), как обычный скрипт: библиотека лежит в lib/vendor. */
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsQRp ||= new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = './lib/vendor/jsQR.min.js';
    sc.onload = () => ok(window.jsQR);
    sc.onerror = () => { jsQRp = null; fail(new Error('load')); };
    document.head.appendChild(sc);
  });
  return jsQRp;
}

/** Останавливает камеру и таймер распознавания. */
function stop() {
  clearTimeout(timer); timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** Ищет QR на кадре (video или bitmap). Возвращает текст или ''. */
function decode(jsQR, source, w, h, max = 720) {
  const k = Math.min(1, max / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(source, 0, 0, cw, ch);
  const img = cx.getImageData(0, 0, cw, ch);
  return jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' })?.data || '';
}

export default {
  leave: stop,
  render() {
    return `<div class="scan" role="dialog" aria-label="Сканер чека">
      <video class="scan-v" playsinline muted></video>
      <div class="scan-top"><button class="scan-x" data-back aria-label="Закрыть сканер">${ic('x')}</button></div>
      <div class="scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="scan-bot">
        <p class="scan-msg" role="status" data-msg>Наведите камеру на QR-код чека</p>
        <div class="scan-btns"><button class="scan-b" data-pick>${ic('photo')} Фото из галереи</button></div>
        <input type="file" accept="image/*" hidden data-file>
      </div></div>`;
  },
  bind(root, s, a) {
    const msg = $('[data-msg]', root), video = $('.scan-v', root);
    const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

    /** Результат распознавания: чек → форма добавления с готовой суммой и датой. */
    const handle = (text) => {
      const now = Date.now();
      if (text === lastText && now - lastAt < 2500) return false;   // тот же QR подряд не разбираем заново
      lastText = text; lastAt = now;
      const p = parseReceiptQr(text);
      if (!p) { say('Это не QR кассового чека. Наведите на QR на чеке.', true); return false; }
      if (hasReceipt(a.store.get().txs, p.id)) { say('Этот чек уже добавлен.', true); return false; }
      stop();
      startWith(receiptDraft(p, a.today()), a.store.get());
      a.toast(p.kind === 'receipt' ? 'Чек прочитан: выберите категорию' : 'QR прочитан: проверьте данные');
      a.go('add', { keepDraft: true });
      return true;
    };

    const loop = (jsQR) => {
      if (!video.isConnected || !stream) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const text = decode(jsQR, video, video.videoWidth, video.videoHeight);
        if (text && handle(text)) return;
      }
      timer = setTimeout(() => loop(jsQR), 150);
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { say('Камера недоступна. Выберите фото чека из галереи.', true); return; }
      try {
        const jsQR = await loadJsQR();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (!video.isConnected) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        loop(jsQR);
      } catch (e) {
        stop();
        say(e?.name === 'NotAllowedError'
          ? 'Нет доступа к камере. Разрешите её в Настройки iPhone → Мы → Камера или выберите фото из галереи.'
          : e?.message === 'load' ? 'Не удалось загрузить распознавание. Проверьте интернет.' : 'Камера не запустилась. Выберите фото чека из галереи.', true);
      }
    };

    const file = $('[data-file]', root);
    $('[data-pick]', root).onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files?.[0]; file.value = '';
      if (!f) return;
      say('Ищу QR на фото…');
      try {
        const jsQR = await loadJsQR(), bmp = await createImageBitmap(f);
        let text = '';
        for (const max of [1600, 1000, 600]) { text = decode(jsQR, bmp, bmp.width, bmp.height, max); if (text) break; }
        bmp.close?.();
        if (!text) say('QR не найден на фото. Сфотографируйте QR ближе и ровнее.', true);
        else { lastText = ''; handle(text); }
      } catch { say('Не удалось прочитать фото.', true); }
    };
    startCamera();
  },
};
