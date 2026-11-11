'use strict';
/* ============================================================
 * 08-tools-color.js : Adjust, Curves, Effects
 * They work on one picture layer: the selected photo, or the
 * background photo when nothing is selected. While the tool is
 * open a small copy is shown (fast); the full-size picture is
 * only processed when the tick is pressed.
 * ============================================================ */
const AdjustTool = {};
const CurvesTool = {};
const EffectsTool = {};
(function () {
  const h = U.h;
  const PV = U.isTouch() ? 720 : 900;      // longest side of the live preview copy (smaller on phones so sliders stay smooth)

  function pickLayer(target) {
    const l = target || Doc.targetImage();
    if (!l) U.toast('Add a photo first');
    return l;
  }
  function hasAlpha(img) {
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }
  /* shared "hold to compare" behaviour: show(false) = original, show(true) = edited */
  function compare(show) { return { down: () => show(false), up: () => show(true) }; }

  /* ============================ ADJUST ============================ */
  const PARAMS = [['brightness', 'Brightness'], ['contrast', 'Contrast'], ['clarity', 'Clarity'], ['saturation', 'Saturation'],
    ['hue', 'Hue'], ['shadows', 'Shadows'], ['highlights', 'Highlights'], ['temp', 'Temp']];

  AdjustTool.open = function (target) {
    const l = pickLayer(target);
    if (!l) return;
    const pv = U.fitInside(l.bitmap, PV);
    const src = IP.read(pv), dst = new ImageData(pv.width, pv.height);
    const out = U.canvas(pv.width, pv.height), octx = out.getContext('2d');
    const lb = IP.clarityMap(pv);
    const vals = {};
    for (const p of PARAMS) vals[p[0]] = 0;
    let cur = 'brightness', showing = true;
    const changed = () => PARAMS.some((p) => vals[p[0]] !== 0);
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      if (!changed() || !showing) View.overrides.delete(l.id);
      else { IP.adjust(src, dst, vals, lb); octx.putImageData(dst, 0, 0); View.overrides.set(l.id, out); }
      View.request();
    });
    const slider = UI.slider({ label: 'Brightness', min: -100, max: 100, value: 0, resetTo: 0, onInput: (v) => { vals[cur] = v; UI.setDot(cur, v !== 0); update(); } });
    const label = slider.querySelector('.sl-l');
    const pick = (id, name) => { cur = id; label.textContent = name; slider.set(vals[id]); UI.markActive(id); };
    const items = PARAMS.map((p) => ({ id: p[0], icon: p[0], label: p[1], onTap: () => pick(p[0], p[1]) }));
    items.push({ sep: true }, { id: 'reset', icon: 'reset', label: 'Reset', onTap: () => { for (const p of PARAMS) { vals[p[0]] = 0; UI.setDot(p[0], false); } slider.set(0); update(); } });
    const m = {
      title: 'Adjust', items: items, panel: h('div', { class: 'panel-pad' }, slider),
      compare: compare((on) => { showing = on; update(); }),
      apply: async () => {
        if (!changed()) return;
        await U.busy(() => {
          const full = IP.read(l.bitmap);
          IP.adjust(full, full, vals, vals.clarity ? IP.clarityMap(l.bitmap) : null);
          l.bitmap = IP.write(full);
          History.commit();
        }, 'Applying…');
      }
    };
    UI.enterMode(m);
    UI.markActive('brightness');
  };

  /* ============================ CURVES ============================ */
  CurvesTool.open = function (target) {
    const l = pickLayer(target);
    if (!l) return;
    const pv = U.fitInside(l.bitmap, PV);
    const src = IP.read(pv), dst = new ImageData(pv.width, pv.height);
    const out = U.canvas(pv.width, pv.height), octx = out.getContext('2d');
    const hist = IP.histogram(src);
    let hmax = 1;
    for (let i = 2; i < 254; i++) if (hist[i] > hmax) hmax = hist[i];
    const ident = () => [[0, 0], [255, 255]];
    const pts = { rgb: ident(), r: ident(), g: ident(), b: ident() };
    let ch = 'rgb', showing = true, active = -1, drag = null;
    const COL = { rgb: '#ffffff', r: '#ff5b5b', g: '#4ade80', b: '#60a5fa' };
    const isIdent = (a) => a.length === 2 && a[0][0] === 0 && a[0][1] === 0 && a[1][0] === 255 && a[1][1] === 255;
    const changed = () => !(isIdent(pts.rgb) && isIdent(pts.r) && isIdent(pts.g) && isIdent(pts.b));

    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      if (!changed() || !showing) View.overrides.delete(l.id);
      else { const t = IP.curveTables(pts); IP.applyLUT(src, dst, t[0], t[1], t[2]); octx.putImageData(dst, 0, 0); View.overrides.set(l.id, out); }
      View.request();
    });

    /* ---- the little graph ---- */
    const N = Math.round(U.clamp(Math.min(window.innerWidth - 70, window.innerHeight * 0.3), 170, 270)), PAD = 14;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cv = h('canvas', { width: Math.round((N + 2 * PAD) * dpr), height: Math.round((N + 2 * PAD) * dpr), style: { width: (N + 2 * PAD) + 'px', height: (N + 2 * PAD) + 'px' } });
    const X = (v) => PAD + v / 255 * N, Y = (v) => PAD + (1 - v / 255) * N;
    function draw() {
      const x = cv.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, N + 2 * PAD, N + 2 * PAD);
      x.fillStyle = 'rgba(255,255,255,.13)';
      x.beginPath(); x.moveTo(PAD, PAD + N);
      for (let i = 0; i < 256; i++) x.lineTo(X(i), PAD + N - Math.min(1, hist[i] / hmax) * N * 0.92);
      x.lineTo(PAD + N, PAD + N); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 1; x.beginPath();
      for (let i = 0; i <= 4; i++) { const p = PAD + N * i / 4; x.moveTo(p, PAD); x.lineTo(p, PAD + N); x.moveTo(PAD, p); x.lineTo(PAD + N, p); }
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(0), Y(0)); x.lineTo(X(255), Y(255)); x.stroke(); x.setLineDash([]);
      for (const k of ['r', 'g', 'b', 'rgb']) {                          // faint lines for the other channels
        if (k === ch || isIdent(pts[k])) continue;
        const lut = IP.curveLUT(pts[k]);
        x.strokeStyle = COL[k]; x.globalAlpha = 0.35; x.lineWidth = 1.2; x.beginPath();
        for (let i = 0; i < 256; i++) { if (i) x.lineTo(X(i), Y(lut[i])); else x.moveTo(X(i), Y(lut[i])); }
        x.stroke(); x.globalAlpha = 1;
      }
      const lut = IP.curveLUT(pts[ch]);
      x.strokeStyle = COL[ch]; x.lineWidth = 2.2; x.lineJoin = 'round'; x.beginPath();
      for (let i = 0; i < 256; i++) { if (i) x.lineTo(X(i), Y(lut[i])); else x.moveTo(X(i), Y(lut[i])); }
      x.stroke();
      pts[ch].forEach((p, i) => {
        x.beginPath(); x.arc(X(p[0]), Y(p[1]), i === active ? 8 : 6.5, 0, 6.2832);
        x.fillStyle = i === active ? COL[ch] : '#1d1d1d'; x.fill();
        x.lineWidth = 2; x.strokeStyle = COL[ch]; x.stroke();
      });
    }
    function at(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - PAD) / N * 255, (1 - (e.clientY - r.top - PAD) / N) * 255]; }
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const p = at(e), a = pts[ch], reach = 24 / N * 255;
      let best = -1, bd = reach;
      a.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
      if (best < 0) {
        if (a.length >= 9) { U.toast('That is the most points a curve can have'); return; }
        let i = 0;
        while (i < a.length && a[i][0] < p[0]) i++;
        i = U.clamp(i, 1, a.length - 1);
        const x = U.clamp(Math.round(p[0]), a[i - 1][0] + 6, a[i][0] - 6);
        if (a[i][0] - a[i - 1][0] < 13) return;
        a.splice(i, 0, [x, U.clamp(Math.round(p[1]), 0, 255)]);
        best = i;
      }
      active = best; drag = { i: best, out: false };
      draw(); update();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = at(e), a = pts[ch], i = drag.i, end = i === 0 || i === a.length - 1;
      if (!end) a[i][0] = U.clamp(Math.round(p[0]), a[i - 1][0] + 6, a[i + 1][0] - 6);
      a[i][1] = U.clamp(Math.round(p[1]), 0, 255);
      drag.out = !end && (p[1] < -45 || p[1] > 300 || p[0] < -45 || p[0] > 300);     // pulled well outside = delete
      draw(); update();
    });
    const up = () => {
      if (!drag) return;
      if (drag.out) { pts[ch].splice(drag.i, 1); active = -1; }
      drag = null; draw(); update();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    const chips = UI.chips([['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], 'rgb', (v) => { ch = v; active = -1; draw(); });
    const reset = h('button', { class: 'chip ghost', type: 'button' }, I.el('reset'), h('span', { text: 'Reset' }));
    U.onTap(reset, () => { pts.rgb = ident(); pts.r = ident(); pts.g = ident(); pts.b = ident(); active = -1; draw(); update(); });
    chips.appendChild(reset);
    const m = {
      title: 'Curves',
      panel: h('div', { class: 'panel-pad' }, h('div', { class: 'curve-wrap' }, cv), h('p', { class: 'panel-note', text: 'Tap the line to add a point · drag a point out of the box to remove it' })),
      bar: chips,
      compare: compare((on) => { showing = on; update(); }),
      apply: async () => {
        if (!changed()) return;
        await U.busy(() => {
          const full = IP.read(l.bitmap), t = IP.curveTables(pts);
          IP.applyLUT(full, full, t[0], t[1], t[2]);
          l.bitmap = IP.write(full);
          History.commit();
        }, 'Applying…');
      }
    };
    UI.enterMode(m);
    draw();
  };

  /* ============================ EFFECTS ============================ */
  EffectsTool.open = function (target) {
    const l = pickLayer(target);
    if (!l) return;
    const pv = U.readable(U.fitInside(l.bitmap, PV));
    const alpha = hasAlpha(IP.read(U.readable(U.fitInside(pv, 160))));
    const S = Math.max(pv.width, pv.height) / 1000;
    const out = U.canvas(pv.width, pv.height), octx = out.getContext('2d');
    // small square copy for the thumbnails
    const TS = 124, side = Math.min(l.bitmap.width, l.bitmap.height);
    const sq = U.canvas(side, side);
    sq.getContext('2d').drawImage(l.bitmap, -(l.bitmap.width - side) / 2, -(l.bitmap.height - side) / 2);
    const thumb = U.readable(U.resample(sq, TS, TS));
    const ST = TS * Math.max(l.bitmap.width, l.bitmap.height) / side / 1000;

    let cat = 'fx', fx = null, amount = 100, full = null, showing = true, token = 0;
    const keepShape = (f) => alpha && f.cat !== 'blur' && f.cat !== 'distort';
    function mask(canvas, srcCanvas) {
      const x = canvas.getContext('2d');
      x.save(); x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(srcCanvas, 0, 0, canvas.width, canvas.height); x.restore();
    }
    /* run one effect on a picture and mix it with the original as the slider says */
    function produce(f, srcCanvas, scale, cached) {
      const t = amount / 100;
      const res = cached || f.run(srcCanvas, f.kind === 'strength' ? t : 1, scale);
      if (f.kind === 'strength' && !keepShape(f)) return { out: res, full: null };
      const c = U.canvas(srcCanvas.width, srcCanvas.height), x = c.getContext('2d');
      if (f.kind === 'blend') { x.drawImage(srcCanvas, 0, 0); x.globalAlpha = t; x.drawImage(res, 0, 0); x.globalAlpha = 1; }
      else x.drawImage(res, 0, 0);
      if (keepShape(f)) mask(c, srcCanvas);
      return { out: c, full: f.kind === 'blend' ? res : null };
    }
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      if (!fx || !showing) { View.overrides.delete(l.id); View.request(); return; }
      try {
        const r = produce(fx, pv, S, full);
        if (r.full) full = r.full;
        octx.clearRect(0, 0, out.width, out.height); octx.drawImage(r.out, 0, 0);
        View.overrides.set(l.id, out);
      } catch (e) { console.error(e); U.toast('This effect did not work on this picture'); View.overrides.delete(l.id); }
      View.request();
    });

    const slider = UI.slider({ label: 'Amount', min: 0, max: 100, value: 100, onInput: (v) => { amount = v; update(); } });
    slider.style.visibility = 'hidden';
    const strip = h('div', { class: 'fx-strip' });
    function choose(f, el) {
      fx = f; full = null;
      for (const c of strip.children) c.classList.toggle('on', c === el);
      if (f) { amount = f.def; slider.set(amount); slider.style.visibility = 'visible'; } else slider.style.visibility = 'hidden';
      update();
    }
    async function fill() {
      const my = ++token;
      U.clear(strip); strip.scrollLeft = 0;
      const none = h('button', { class: 'fx-it' + (fx ? '' : ' on'), type: 'button', 'data-id': 'none' }, U.cloneCanvas(thumb), h('span', { text: 'None' }));
      U.onTap(none, () => choose(null, none));
      strip.appendChild(none);
      const list = FX.list.filter((f) => f.cat === cat), cells = [];
      for (const f of list) {
        const cv = h('canvas', { width: TS, height: TS });
        const b = h('button', { class: 'fx-it' + (fx === f ? ' on' : ''), type: 'button', 'data-id': f.id }, cv, h('span', { text: f.name }));
        U.onTap(b, () => choose(f, b));
        strip.appendChild(b); cells.push([f, cv]);
      }
      for (const c of cells) {                                        // draw the small pictures one by one so the screen stays alive
        await new Promise((r) => setTimeout(r, 0));
        if (my !== token || UI.mode() !== m) return;
        try {
          const r = c[0].run(thumb, c[0].kind === 'strength' ? c[0].def / 100 : 1, ST), x = c[1].getContext('2d');
          x.drawImage(r, 0, 0, TS, TS);
          if (keepShape(c[0])) mask(c[1], thumb);
        } catch (e) { console.error(e); }
      }
    }
    const chips = UI.chips(FX.cats, cat, (v) => { cat = v; fill(); });
    const m = {
      title: 'Effects',
      panel: h('div', { class: 'panel-pad' }, slider, strip),
      bar: chips,
      compare: compare((on) => { showing = on; update(); }),
      apply: async () => {
        if (!fx || (fx.kind === 'blend' && amount === 0)) return;
        await U.busy(() => {
          const r = produce(fx, l.bitmap, Math.max(l.bitmap.width, l.bitmap.height) / 1000, null);
          l.bitmap = r.out;
          History.commit();
        }, 'Applying ' + fx.name + '…');
      }
    };
    UI.enterMode(m);
    fill();
  };
})();
