'use strict';
/* 11-export.js : save the finished picture (JPG / PNG), share it */
const Exporter = {};
(function () {
  const h = U.h;
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  function toBlob(canvas, type, q) {
    return new Promise((res, rej) => {
      if (canvas.toBlob) canvas.toBlob((b) => b ? res(b) : rej(new Error('The browser could not make the file')), type, q);
      else rej(new Error('This browser cannot save pictures'));
    });
  }
  /* fmt 'jpg' | 'png', quality 0..1 (jpg), maxDim optional.
     The finished picture is rendered once and kept while nothing has changed, so pressing Save again
     (or opening the sheet) is instant. A render that is already running is shared, not started twice. */
  Exporter._cache = null;      // { key, r }
  Exporter._pending = null;    // { key, promise }
  Exporter._rendering = false;
  Exporter.render = async function (fmt, quality, maxDim) {
    const key = [Doc.serial, Doc._ver, fmt, quality || 0.92, maxDim || 0].join('|');
    if (Exporter._cache && Exporter._cache.key === key) return Exporter._cache.r;
    if (Exporter._pending && Exporter._pending.key === key) return Exporter._pending.promise;
    const ver = Doc._ver, serial = Doc.serial;
    Exporter._rendering = true;
    const promise = (async () => {
      try {
        const jpg = fmt === 'jpg';
        const c = Doc.flatten({ fill: jpg ? '#ffffff' : null, maxDim: maxDim || 0 });
        const blob = await toBlob(c, jpg ? 'image/jpeg' : 'image/png', jpg ? (quality || 0.92) : undefined);
        const r = { blob: blob, canvas: c, w: c.width, h: c.height, name: APP_NAME + '_' + stamp() + (jpg ? '.jpg' : '.png') };
        if (Doc._ver === ver && Doc.serial === serial) Exporter._cache = { key: key, r: r };      // only keep it if nothing changed while it was made
        return r;
      } finally {
        Exporter._rendering = false;
        if (Exporter._pending && Exporter._pending.promise === promise) Exporter._pending = null;
      }
    })();
    Exporter._pending = { key: key, promise: promise };
    return promise;
  };
  /* keep the finished picture ready: render it in the background once editing has settled,
     so that pressing Save is instant. Nothing is shown while it runs. */
  let preTimer = null;
  function schedulePre() {
    clearTimeout(preTimer);
    preTimer = setTimeout(() => {
      if (document.hidden || !Doc.open || UI.mode() || Exporter._rendering) return;
      if (window.AICut && AICut.running && AICut.running()) return;      // never take the processor away from Remove BG
      Exporter.render(Exporter.autoFormat()).catch(() => { /* the next real save renders anyway */ });
    }, 1200);
  }
  U.on('doc', () => { Doc._ver++; schedulePre(); });
  U.on('history', () => { Doc._ver++; schedulePre(); });
  /* hand a file to the user -> Promise: where it went, in words for a message.
     A browser downloads it; the Android app puts pictures into Pictures › RongTuli and other files into Download › RongTuli. */
  async function download(blob, name) {
    if (Native.on) return Native.save(blob, name);
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 8000);
    return 'look in Downloads';
  }
  Exporter.download = download;
  Exporter.autoFormat = () => (Doc.hasTransparency() ? 'png' : 'jpg');

  Exporter.save = async function (fmt) {
    if (!Doc.open) return;
    if (U.sandboxed()) { Exporter.open(fmt); return; }           // this preview window blocks downloads: show the picture instead
    try {
      const r = await U.busy(() => Exporter.render(fmt || Exporter.autoFormat()), 'Saving…');
      const where = await download(r.blob, r.name);
      U.toast('Saved ' + r.name + ' (' + kb(r.blob.size) + ') — ' + where, 3200);
    } catch (e) {
      if (Native.on) console.warn('save:', e && e.message); else console.error(e);      // in the app a "no" from the phone (permission) is an answer, not a fault
      U.toast((e && e.message) || 'Could not save', 3600);
    }
  };
  Exporter.quickSave = () => Exporter.save(Exporter.autoFormat());

  Exporter.open = function (startFmt) {
    if (!Doc.open) return;
    let fmt = startFmt || Exporter.autoFormat(), quality = 92, cur = null, url = null, job = 0;
    const img = h('img', { class: 'ex-prev', alt: 'Your picture' });
    const info = h('div', { class: 'ex-info', text: 'Preparing…' });
    const q = UI.slider({ label: 'Quality', min: 40, max: 100, value: quality, onChange: (v) => { quality = v; make(); } });
    const fm = UI.chips([['jpg', 'JPG'], ['png', 'PNG']], fmt, (v) => { fmt = v; make(); });
    const save = h('button', { class: 'btn pri', type: 'button', id: 'btn-save' }, 'Save');
    const share = h('button', { class: 'btn', type: 'button', id: 'btn-share' }, 'Share');
    const hint = h('div', { class: 'ex-hint' });
    const sh = UI.sheet('Save picture', h('div', null, img, info, fm, q, h('div', { class: 'ex-acts' }, save, share), hint), { onClose: () => { job++; if (url) URL.revokeObjectURL(url); } });
    if (U.sandboxed()) hint.textContent = 'This preview window cannot download files. Press and hold the picture and choose “Save image”, or open the app in its own tab.';
    else if (Native.on) hint.textContent = 'Saved pictures go to the folder Pictures › RongTuli and show up in your gallery.';
    else hint.textContent = 'If nothing is downloaded, press and hold the picture and choose “Save image”.';

    async function make() {
      const my = ++job;
      q.style.display = fmt === 'jpg' ? '' : 'none';
      save.disabled = share.disabled = true; info.textContent = 'Preparing…';
      await U.nextFrame();
      try {
        // a small preview first, so the sheet opens at once; the full picture is made behind it
        const small = Doc.flatten({ fill: fmt === 'jpg' ? '#ffffff' : null, maxDim: 900 });
        if (my !== job) return;
        if (url) { URL.revokeObjectURL(url); url = null; }
        if (U.sandboxed()) img.src = small.toDataURL(fmt === 'jpg' ? 'image/jpeg' : 'image/png', quality / 100);
        else { url = URL.createObjectURL(await toBlob(small, fmt === 'jpg' ? 'image/jpeg' : 'image/png', fmt === 'jpg' ? quality / 100 : undefined)); img.src = url; }
        info.textContent = 'Preparing the full picture…';
        const r = await Exporter.render(fmt, quality / 100);
        if (my !== job) return;
        cur = r;
        info.textContent = r.w + ' × ' + r.h + ' px · ' + fmt.toUpperCase() + ' · ' + kb(r.blob.size);
        save.disabled = share.disabled = false;
      } catch (e) { console.error(e); if (my === job) info.textContent = e.message || 'Could not make the file'; }
    }
    U.onTap(save, async () => {
      if (!cur) return;
      const r = cur;
      try { const where = await download(r.blob, r.name); U.toast('Saved ' + r.name + ' — ' + where, 3200); }
      catch (e) { U.toast(Native.on ? (e && e.message) || 'The picture could not be saved' : 'Press and hold the picture to save it', 3600); }
    });
    U.onTap(share, async () => {
      if (!cur) return;
      try {
        if (Native.on) { await Native.share(cur.blob, cur.name); return; }
        const file = new File([cur.blob], cur.name, { type: cur.blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: APP_NAME });
        else U.toast('Sharing is not available in this browser. Save the picture, then share it from your gallery.', 3200);
      } catch (e) { if (!e || e.name !== 'AbortError') U.toast('Sharing did not work here. Save the picture, then share it from your gallery.', 3200); }
    });
    make();
  };
})();
