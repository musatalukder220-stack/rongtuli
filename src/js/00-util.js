'use strict';
/* ============================================================
 * RongTuli – photo editor
 * 00-util.js : small helpers used everywhere
 * ============================================================ */
const APP_NAME = 'RongTuli';
const APP_VERSION = '0.10';
const LOW_MEM = (navigator.deviceMemory || 4) <= 2;      // phones with 2 GB of memory or less
const MAX_DIM = LOW_MEM ? 1600 : 2048;                   // longest side of the working picture (keeps phones from running out of memory)

const U = {};
(function () {
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  let _n = 1;
  U.uid = () => 'L' + (_n++) + Math.random().toString(36).slice(2, 6);
  U.isTouch = () => (navigator.maxTouchPoints || 0) > 0;
  /* true inside a locked-down preview frame (no downloads, no storage). A file opened straight from the phone is NOT that. */
  U.sandboxed = () => { try { return window.origin === 'null' && !/^(file|content):$/.test(location.protocol); } catch (e) { return true; } };

  /* ---------- DOM ---------- */
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { for (const k of kid) append(el, k); return; }
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  U.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'data') { for (const d in v) el.dataset[d] = v[d]; }
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* "tap" that works for mouse + touch without the 300ms delay or ghost clicks */
  U.onTap = function (el, fn) { el.addEventListener('click', (e) => { e.preventDefault(); fn(e); }); return el; };

  /* ---------- canvas ---------- */
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  U.cloneCanvas = function (src) {
    const c = U.canvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  /* a copy that is quick to read pixels from again and again (used by live previews) */
  U.readable = function (src) {
    const c = U.canvas(src.width, src.height);
    c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
    return c;
  };
  /* good quality resample (halves repeatedly when shrinking a lot) */
  U.resample = function (src, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    let cur = src, cw = src.width, ch = src.height;
    while (cw / 2 > w && ch / 2 > h) {
      cw = Math.round(cw / 2); ch = Math.round(ch / 2);
      const t = U.canvas(cw, ch), tx = t.getContext('2d');
      tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
      tx.drawImage(cur, 0, 0, cw, ch);
      cur = t;
    }
    const out = U.canvas(w, h), ox = out.getContext('2d');
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(cur, 0, 0, w, h);
    return out;
  };
  U.fitInside = function (src, maxDim) {
    const k = Math.min(1, maxDim / Math.max(src.width, src.height));
    return k >= 1 ? src : U.resample(src, src.width * k, src.height * k);
  };

  /* ---------- files / images ---------- */
  U.readAsDataURL = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
  U.readAsArrayBuffer = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read the file'));
    r.readAsArrayBuffer(file);
  });
  U.loadImage = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('This file is not an image the browser can open'));
    im.src = src;
  });
  /* image file -> canvas, shrunk so the longest side is <= maxDim */
  U.fileToCanvas = async function (file, maxDim) {
    const url = await U.readAsDataURL(file);
    const im = await U.loadImage(url);
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (!w || !h) throw new Error('Empty image');
    const k = Math.min(1, (maxDim || MAX_DIM) / Math.max(w, h));
    const c = U.canvas(w * k, h * k), cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(im, 0, 0, c.width, c.height);
    return c;
  };
  U.svgToCanvas = async function (svgText, size) {
    const im = await U.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText));
    const c = U.canvas(size, size);
    c.getContext('2d').drawImage(im, 0, 0, size, size);
    return c;
  };
  U.pickFiles = function (accept, multiple) {
    return new Promise((resolve) => {
      const inp = U.h('input', { type: 'file', accept: accept, style: 'position:fixed;left:-9999px;top:0;opacity:0' });
      if (multiple) inp.multiple = true;
      document.body.appendChild(inp);
      let done = false;
      const finish = (files) => { if (done) return; done = true; inp.remove(); resolve(files); };
      inp.addEventListener('change', () => finish(Array.from(inp.files || [])));
      inp.addEventListener('cancel', () => finish([]));
      inp.click();
    });
  };
  /* crop away fully transparent borders */
  U.trimCanvas = function (c, pad) {
    const w = c.width, h = c.height;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4 + 3;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return null;
    pad = pad || 0;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = U.canvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(c, -x0, -y0);
    return { canvas: out, x: x0, y: y0 };
  };

  /* ---------- colour ---------- */
  U.hexToRgb = function (hex) {
    let s = String(hex || '#000').replace('#', '').trim();
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s.slice(0, 6), 16);
    if (isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.rgba = function (hex, a) { const c = U.hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  U.hsvToRgb = function (h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };
  U.rgbToHsv = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx];
  };
  U.luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  /* deterministic random numbers (so a spray stroke / grain looks the same when redrawn) */
  U.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- timing ---------- */
  U.rafThrottle = function (fn) {
    let queued = false, lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn.apply(null, lastArgs); });
    };
  };
  U.nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  /* ---------- tiny event bus ---------- */
  const listeners = {};
  U.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  U.emit = function (ev, a, b) { const l = listeners[ev]; if (l) for (const fn of l.slice()) fn(a, b); };

  /* ---------- toast + busy ---------- */
  let toastTimer = null;
  U.toast = function (msg, ms) {
    let t = U.$('#toast');
    if (!t) { t = U.h('div', { id: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1900);
  };
  /* show a spinner, let it paint, then run heavy (blocking) work */
  U.busy = async function (fn, label) {
    let b = U.$('#busy');
    if (!b) {
      b = U.h('div', { id: 'busy' }, U.h('div', { class: 'spin' }), U.h('div', { class: 'busy-l' }));
      document.body.appendChild(b);
    }
    b.querySelector('.busy-l').textContent = label || 'Working…';
    b.classList.add('show');
    await U.nextFrame(); await U.nextFrame();
    try { return await fn(); }
    finally { b.classList.remove('show'); }
  };
  /* change the words under the spinner while it is showing */
  U.busyLabel = function (label) { const b = U.$('#busy .busy-l'); if (b) b.textContent = label; };
})();

/* ---------- the Android app ----------
   In the app (folder android/) the page runs inside a web view, which cannot download or share files by itself.
   The app puts an object "RTAndroid" into the page; a file is handed over in pieces of base64:
     begin(name, type) -> number · chunk(number, base64) -> ok · save(number) -> "look in …" or "!what went wrong" · share(number) -> ok */
const Native = {};
(function () {
  const A = window.RTAndroid;
  Native.on = !!(A && A.begin && A.chunk && A.save);
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function send(blob, name) {
    const id = A.begin(String(name || 'file'), String(blob.type || 'application/octet-stream'));
    if (!(id > 0)) throw new Error('The phone did not take the file');
    const u8 = new Uint8Array(await blob.arrayBuffer()), STEP = 196608;      // a multiple of 3, so every piece is whole base64
    for (let o = 0; o < u8.length; o += STEP) {
      if (!A.chunk(id, b64(u8.subarray(o, o + STEP)))) throw new Error('The phone could not write the file');
    }
    return id;
  }
  /* -> where the file went, in words for a message */
  /* open a web link in the phone's browser (the update link); back in the app afterwards */
  Native.openUrl = function (url) {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('That is not a web link');
    if (A && A.openUrl) A.openUrl(String(url));
    else location.href = String(url);
  };
  Native.save = async function (blob, name) {
    const r = String(A.save(await send(blob, name)));
    if (r.charAt(0) === '!') throw new Error(r.slice(1));
    return r;
  };
  Native.share = async function (blob, name) {
    if (!A.share(await send(blob, name))) throw new Error('Sharing did not work on this phone');
    return true;
  };
  Native.info = function () { try { return JSON.parse(String(A.info())); } catch (e) { return {}; } };
})();
