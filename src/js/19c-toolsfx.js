'use strict';
/* ============================================================
 * 19c-toolsfx.js : the rest of the Tools grid, and Replay
 *   EnhanceTool     - one slider that makes a flat photo punchier
 *   TiltShiftTool   - keep a band (or a spot) sharp, blur the rest
 *   PerspectiveTool - lean the photo back / sideways
 *   MotionTool      - a trail behind a cut-out, or a moving blur
 *   SelectionTool   - mark a part (box, oval, free), then copy / cut / delete / crop
 *   StretchTool     - push, swirl, squeeze and inflate the picture
 *   DispersionTool  - a part of the picture flies away in small pieces
 *   ReplayTool      - ready-made looks that are applied step by step
 * ============================================================ */
const EnhanceTool = {};
const TiltShiftTool = {};
const PerspectiveTool = {};
const MotionTool = {};
const SelectionTool = {};
const StretchTool = {};
const DispersionTool = {};
const ReplayTool = {};
(function () {
  const h = U.h;
  const PV = U.isTouch() ? 720 : 900;      // longest side of the live preview copy
  const pad = (...kids) => h('div', { class: 'panel-pad' }, kids);
  const note = (t) => h('p', { class: 'panel-note', text: t });
  function pick(t) {
    const l = t && t.type === 'image' ? t : Doc.targetImage();
    if (!l) U.toast('Add a photo first');
    return l;
  }
  const toBmp = (l, d) => RetouchTool._toBmp(l, d);
  function toDocPt(l, q) {
    const lx = (q[0] - l.bitmap.width / 2) * l.scaleX * (l.flipH ? -1 : 1), ly = (q[1] - l.bitmap.height / 2) * l.scaleY * (l.flipV ? -1 : 1), c = Math.cos(l.rotation), s = Math.sin(l.rotation);
    return [l.x + lx * c - ly * s, l.y + lx * s + ly * c];
  }
  /* has the picture see-through parts? (looked up on a small copy) */
  function solid(bitmap) {
    const c = U.canvas(40, 40), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bitmap, 0, 0, 40, 40);
    const d = x.getImageData(0, 0, 40, 40).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 245) return false;
    return true;
  }
  const compareOf = (set) => ({ down: () => set(false), up: () => set(true) });

  /* ============================ ENHANCE ============================ */
  EnhanceTool.open = function (target) {
    const l = pick(target);
    if (!l) return;
    const pv = U.readable(U.fitInside(l.bitmap, PV));
    // where the dark and the bright end of this photo really are (half a percent is cut off at each end)
    const hist = new Uint32Array(256), d0 = IP.read(pv).data;
    let n = 0;
    for (let i = 0; i < d0.length; i += 4) if (d0[i + 3] > 20) { hist[Math.round(0.299 * d0[i] + 0.587 * d0[i + 1] + 0.114 * d0[i + 2])]++; n++; }
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.005) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.005) { hi = i; break; } }
    if (hi - lo < 40) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 20); hi = Math.min(255, mid + 20); }
    lo = Math.min(lo, 70); hi = Math.max(hi, 185);                    // a dark photo may stay dark: never stretch wildly
    function run(c, amount) {
      const a = amount / 100, img = IP.read(c), lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = v + ((v - lo) * 255 / (hi - lo) - v) * a;
      IP.applyLUT(img, img, lut, lut, lut);
      IP.adjust(img, img, { saturation: 16 * a, clarity: 36 * a, shadows: 12 * a }, IP.clarityMap(c));
      return IP.write(img);
    }
    let amount = 60, showing = true;
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      if (!showing || amount <= 0) View.overrides.delete(l.id); else View.overrides.set(l.id, run(pv, amount));
      View.request();
    });
    const m = {
      title: 'Enhance',
      panel: pad(UI.slider({ label: 'Amount', min: 0, max: 100, value: amount, onInput: (v) => { amount = v; update(); } }), note('Brings out light, colour and detail in one go.')),
      compare: compareOf((on) => { showing = on; update(); }),
      apply: async () => { if (amount <= 0) return; await U.busy(() => { l.bitmap = run(l.bitmap, amount); delete l.shape; History.commit(); }, 'Applying…'); }
    };
    UI.enterMode(m);
    update();
  };

  /* ============================ TILT SHIFT ============================ */
  TiltShiftTool.mem = { kind: 'linear', blur: 45, size: 22, angle: 0 };
  TiltShiftTool.open = function (target) {
    const l = pick(target);
    if (!l) return;
    const mem = TiltShiftTool.mem, pv = U.readable(U.fitInside(l.bitmap, PV)), full = l.bitmap;
    let cx = 0.5, cy = 0.5, soft = null, softFor = -1, showing = true, drag = null, guideUntil = 0;
    const sigmaOf = (c) => Math.max(0.6, mem.blur / 100 * Math.max(c.width, c.height) * 0.022);
    /* sharp picture with the blurred one laid over it, except in the band / spot */
    function build(c, blurred) {
      const w = c.width, hh = c.height, m0 = Math.min(w, hh), s = mem.size / 100 * m0, f = Math.max(4, s * 1.3 + m0 * 0.04), X = cx * w, Y = cy * hh;
      const tmp = U.canvas(w, hh), t = tmp.getContext('2d');
      let g;
      if (mem.kind === 'radial') { g = t.createRadialGradient(X, Y, s, X, Y, s + f); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
      else {
        const a = mem.angle * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a), e = s + f, q = f / (2 * e);
        g = t.createLinearGradient(X - nx * e, Y - ny * e, X + nx * e, Y + ny * e);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(q, 'rgba(0,0,0,0)'); g.addColorStop(1 - q, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      }
      t.fillStyle = g; t.fillRect(0, 0, w, hh);
      t.globalCompositeOperation = 'source-in'; t.drawImage(blurred, 0, 0, w, hh);
      const out = U.canvas(w, hh), o = out.getContext('2d');
      o.drawImage(c, 0, 0); o.drawImage(tmp, 0, 0);
      return out;
    }
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      if (!showing) { View.overrides.delete(l.id); View.request(); return; }
      if (softFor !== mem.blur) { soft = IP.write(IP.blur(IP.read(pv), sigmaOf(pv))); softFor = mem.blur; }
      View.overrides.set(l.id, build(pv, soft));
      View.request();
    });
    const guide = () => { guideUntil = Date.now() + 1200; setTimeout(() => View.request(), 1250); update(); };
    const m = {
      title: 'Tilt Shift',
      panel: pad(
        UI.chips([['linear', 'Band'], ['radial', 'Spot']], mem.kind, (v) => { mem.kind = v; guide(); }),
        UI.slider({ label: 'Blur', min: 5, max: 100, value: mem.blur, onInput: (v) => { mem.blur = v; update(); } }),
        UI.slider({ label: 'Sharp part', min: 4, max: 60, value: mem.size, onInput: (v) => { mem.size = v; guide(); } }),
        UI.slider({ label: 'Angle', min: -90, max: 90, value: mem.angle, resetTo: 0, onInput: (v) => { mem.angle = v; guide(); } }),
        note('Drag on the photo to move the sharp part.')),
      compare: compareOf((on) => { showing = on; update(); }),
      pointerDown: (p) => { const q = toBmp(l, View.toDoc(p[0], p[1])); drag = { q: q, cx: cx, cy: cy }; guide(); },
      pointerMove: (p) => { if (!drag) return; const q = toBmp(l, View.toDoc(p[0], p[1])); cx = U.clamp(drag.cx + (q[0] - drag.q[0]) / full.width, 0, 1); cy = U.clamp(drag.cy + (q[1] - drag.q[1]) / full.height, 0, 1); guide(); },
      pointerUp: () => { drag = null; },
      pointerCancel: () => { if (drag) { cx = drag.cx; cy = drag.cy; drag = null; update(); } },
      overlay: (ctx, v) => {
        if (!drag && Date.now() > guideUntil) return;
        const W = full.width, H = full.height, s = mem.size / 100 * Math.min(W, H), c = [cx * W, cy * H];
        const P = (x, y) => { const d = toDocPt(l, [x, y]); return v.toView(d[0], d[1]); };
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]); ctx.beginPath();
        if (mem.kind === 'radial') { for (let i = 0; i <= 48; i++) { const a = i / 48 * 6.2832, q = P(c[0] + s * Math.cos(a), c[1] + s * Math.sin(a)); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } }
        else {
          const a = mem.angle * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), L = Math.hypot(W, H);
          for (const sg of [-1, 1]) { const ox = c[0] - uy * s * sg, oy = c[1] + ux * s * sg, A = P(ox - ux * L, oy - uy * L), B = P(ox + ux * L, oy + uy * L); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        }
        ctx.stroke(); ctx.restore();
      },
      apply: async () => { await U.busy(() => { const b = IP.write(IP.blur(IP.read(full), sigmaOf(full))); l.bitmap = build(full, b); delete l.shape; History.commit(); }, 'Applying…'); }
    };
    UI.enterMode(m);
    guide();
  };

  /* ============================ PERSPECTIVE ============================ */
  PerspectiveTool.open = function (target) {
    const l = pick(target);
    if (!l) return;
    const pv = U.readable(U.fitInside(l.bitmap, PV));
    let hv = 0, vv = 0, showing = true;
    function run(c) {
      const w = c.width, hh = c.height, a = vv / 100 * 0.32, b = hv / 100 * 0.32;
      const q = [[0, 0], [w, 0], [w, hh], [0, hh]];
      if (a > 0) { q[0][0] += a * w; q[1][0] -= a * w; } else { q[3][0] -= a * w; q[2][0] += a * w; }       // top or bottom gets narrower
      if (b > 0) { q[1][1] += b * hh; q[2][1] -= b * hh; } else { q[0][1] -= b * hh; q[3][1] += b * hh; }  // right or left gets shorter
      const r = PLP._ops.warp(c, q);
      if (!r) return null;
      const out = U.canvas(w, hh);
      out.getContext('2d').drawImage(r.canvas, r.ox, r.oy);
      return out;
    }
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      const r = showing && (hv || vv) ? run(pv) : null;
      if (r) View.overrides.set(l.id, r); else View.overrides.delete(l.id);
      View.request();
    });
    const m = {
      title: 'Perspective',
      panel: pad(
        UI.slider({ label: 'Up / down', min: -100, max: 100, value: 0, resetTo: 0, onInput: (v) => { vv = v; update(); } }),
        UI.slider({ label: 'Left / right', min: -100, max: 100, value: 0, resetTo: 0, onInput: (v) => { hv = v; update(); } }),
        note('Straightens leaning buildings, or lays the photo back. Crop afterwards to tidy the edges.')),
      compare: compareOf((on) => { showing = on; update(); }),
      apply: async () => {
        if (!hv && !vv) return;
        await U.busy(() => { const r = run(l.bitmap); if (!r) throw new Error('the picture is too big'); l.bitmap = r; delete l.shape; History.commit(); }, 'Applying…');
      }
    };
    UI.enterMode(m);
  };

  /* ============================ MOTION ============================ */
  MotionTool.mem = { dist: 30, angle: 180, count: 8, fade: 60 };
  MotionTool.open = function (target) {
    const l = pick(target);
    if (!l) return;
    const mem = MotionTool.mem, full = l.bitmap, pv = U.fitInside(full, PV), blurMode = l.base || solid(pv);
    let showing = true, drag = null, res = null;
    /* -> { c: picture, ox, oy: where the old picture sits inside it } */
    function run(c) {
      const w = c.width, hh = c.height, D = mem.dist / 100 * Math.max(w, hh) * 0.6, a = mem.angle * Math.PI / 180, vx = Math.cos(a) * D, vy = Math.sin(a) * D, n = Math.round(mem.count);
      if (blurMode) {
        const out = U.canvas(w, hh), o = out.getContext('2d');
        o.drawImage(c, 0, 0);
        for (let i = 1; i <= n * 2; i++) { o.globalAlpha = 1 / (i + 1) * (0.4 + mem.fade / 100); o.drawImage(c, vx * i / (n * 2), vy * i / (n * 2)); }
        return { c: out, ox: 0, oy: 0 };
      }
      const ox = Math.round(Math.max(0, -vx)), oy = Math.round(Math.max(0, -vy));
      const out = U.canvas(w + Math.round(Math.abs(vx)), hh + Math.round(Math.abs(vy))), o = out.getContext('2d');
      for (let i = n; i >= 1; i--) { o.globalAlpha = Math.pow(1 - i / (n + 1), 1.3) * (0.25 + mem.fade / 100 * 0.7); o.drawImage(c, ox + vx * i / n, oy + vy * i / n); }
      o.globalAlpha = 1; o.drawImage(c, ox, oy);
      return { c: out, ox: ox, oy: oy };
    }
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      res = showing && mem.dist > 0 ? run(pv) : null;
      if (res && blurMode) { View.overrides.set(l.id, res.c); View.hide.delete(l.id); }
      else { View.overrides.delete(l.id); if (res) View.hide.add(l.id); else View.hide.delete(l.id); }
      View.request();
    });
    const sliders = {
      dist: UI.slider({ label: 'Length', min: 0, max: 100, value: mem.dist, onInput: (v) => { mem.dist = v; update(); } }),
      angle: UI.slider({ label: 'Direction', min: 0, max: 360, value: mem.angle, fmt: (v) => Math.round(v) + '°', onInput: (v) => { mem.angle = v; update(); } })
    };
    const m = {
      title: 'Motion',
      panel: pad(sliders.dist, sliders.angle,
        UI.slider({ label: 'Copies', min: 2, max: 20, value: mem.count, onInput: (v) => { mem.count = v; update(); } }),
        UI.slider({ label: 'Strength', min: 5, max: 100, value: mem.fade, onInput: (v) => { mem.fade = v; update(); } }),
        note(blurMode ? 'Blurs the photo as if it moved. Drag on it to set the direction.' : 'Leaves a trail behind the cut-out. Drag on the picture to set the direction.')),
      compare: compareOf((on) => { showing = on; update(); }),
      /* the trail is bigger than the picture, so it is drawn here in the place of the hidden layer */
      drawDoc: (ctx) => {
        if (!res || blurMode) return;
        const k = full.width / pv.width;
        ctx.save(); ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend || 'source-over';
        ctx.translate(l.x, l.y); ctx.rotate(l.rotation); ctx.scale(l.scaleX * (l.flipH ? -1 : 1), l.scaleY * (l.flipV ? -1 : 1));
        ctx.drawImage(res.c, -full.width / 2 - res.ox * k, -full.height / 2 - res.oy * k, res.c.width * k, res.c.height * k);
        ctx.restore();
      },
      pointerDown: (p) => { drag = toBmp(l, View.toDoc(p[0], p[1])); },
      pointerMove: (p) => {
        if (!drag) return;
        const q = toBmp(l, View.toDoc(p[0], p[1])), dx = q[0] - drag[0], dy = q[1] - drag[1], len = Math.hypot(dx, dy);
        if (len < 6) return;
        mem.angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        mem.dist = U.clamp(len / (Math.max(full.width, full.height) * 0.6) * 100, 0, 100);
        sliders.dist.set(mem.dist); sliders.angle.set(mem.angle); update();
      },
      pointerUp: () => { drag = null; },
      apply: async () => {
        if (mem.dist <= 0) return;
        await U.busy(() => {
          const r = run(full);
          if (blurMode) l.bitmap = r.c;
          else LayerCrop._replace(l, r.c, r.c.width / 2 - r.ox, r.c.height / 2 - r.oy);
          delete l.shape; History.commit();
        }, 'Applying…');
      }
    };
    UI.enterMode(m);
    update();
  };

  /* ============================ SELECTION ============================ */
  SelectionTool.mem = { kind: 'rect' };
  SelectionTool.open = function () {
    const l = pick(Doc.selected());
    if (!l) return;
    const mem = SelectionTool.mem, W = Doc.width, H = Doc.height;
    let sel = null, box = null, live = null, inverted = false;      // sel: Path2D in document px, box: [x0, y0, x1, y1]
    const acts = h('div', { class: 'row-c' });
    function region() {            // what is selected, as a path to fill ('evenodd' when inverted)
      if (!inverted) return sel;
      const p = new Path2D(); p.rect(0, 0, W, H); p.addPath(sel); return p;
    }
    const rule = () => (inverted ? 'evenodd' : 'nonzero');
    function shapeOf(a, b) {
      const x0 = U.clamp(Math.min(a[0], b[0]), 0, W), y0 = U.clamp(Math.min(a[1], b[1]), 0, H), x1 = U.clamp(Math.max(a[0], b[0]), 0, W), y1 = U.clamp(Math.max(a[1], b[1]), 0, H);
      const p = new Path2D();
      if (mem.kind === 'oval') p.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.5, (x1 - x0) / 2), Math.max(0.5, (y1 - y0) / 2), 0, 0, 6.2832); else p.rect(x0, y0, x1 - x0, y1 - y0);
      return { p: p, box: [x0, y0, x1, y1] };
    }
    /* the pixels of the photo inside the selection, as a new picture: { canvas, x, y } (place on the canvas) or null */
    function lift() {
      const c = U.canvas(W, H), x = c.getContext('2d');
      x.save(); x.clip(region(), rule()); Layers.drawRaw(x, l); x.restore();
      return U.trimCanvas(c, 1);
    }
    /* take the selection out of the photo */
    function punch() {
      const c = U.cloneCanvas(l.bitmap), x = c.getContext('2d');
      const M = new DOMMatrix().translate(l.x, l.y).rotate(l.rotation * 180 / Math.PI).scale(l.scaleX * (l.flipH ? -1 : 1), l.scaleY * (l.flipV ? -1 : 1)).translate(-l.bitmap.width / 2, -l.bitmap.height / 2);
      x.setTransform(M.inverse());
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(region(), rule());
      l.bitmap = c; delete l.shape;
    }
    function act(kind) {
      if (!sel) { U.toast('First mark a part of the picture with one finger'); return; }
      if (kind === 'invert') { inverted = !inverted; View.request(); return; }
      if (kind === 'crop') {
        const b = inverted ? [0, 0, W, H] : box, x = Math.floor(b[0]), y = Math.floor(b[1]), w = Math.max(1, Math.ceil(b[2]) - x), hh = Math.max(1, Math.ceil(b[3]) - y);
        Doc.transform([{ t: 'translate', dx: -x, dy: -y }], w, hh);
        History.commit(); UI.exitMode(); View.fit();
        return;
      }
      let made = null;
      if (kind === 'copy' || kind === 'cut') {
        const t = lift();
        if (!t) { U.toast('There is nothing of the photo in this part'); return; }
        made = Layers.image(t.canvas, { name: kind === 'cut' ? 'Cut-out' : 'Copy', x: t.x + t.canvas.width / 2, y: t.y + t.canvas.height / 2 });
      }
      if (kind === 'cut' || kind === 'delete') punch();
      if (made) { Doc.layers.splice(Doc.index(l.id) + 1, 0, made); Doc.selectedId = made.id; }
      History.commit(); UI.exitMode();
      if (made) U.toast(kind === 'cut' ? 'Cut out as a new layer — drag it away' : 'Copied as a new layer — drag it away');
    }
    for (const a of [['copy', 'Copy'], ['cut', 'Cut'], ['delete', 'Delete'], ['crop', 'Crop'], ['invert', 'Invert']]) {
      const b = h('button', { class: 'btn', type: 'button', 'data-act': a[0], text: a[1] });
      U.onTap(b, () => act(a[0]));
      acts.appendChild(b);
    }
    const m = {
      title: 'Selection',
      panel: pad(UI.chips([['rect', 'Box', 'rect'], ['oval', 'Oval', 'oval'], ['free', 'Free hand', 'lasso']], mem.kind, (v) => { mem.kind = v; }), acts,
        note('Mark a part with one finger, then choose what to do with it. The tick copies it as a new layer.')),
      pointerDown: (p) => { const d = View.toDoc(p[0], p[1]); live = { a: d, pts: [d[0], d[1]] }; inverted = false; },
      pointerMove: (p) => {
        if (!live) return;
        const d = View.toDoc(p[0], p[1]);
        if (mem.kind === 'free') { live.pts.push(U.clamp(d[0], 0, W), U.clamp(d[1], 0, H)); }
        else { const s = shapeOf(live.a, d); sel = s.p; box = s.box; }
        View.request();
      },
      pointerUp: () => {
        if (!live) return;
        const q = live.pts; live.done = true;
        if (mem.kind === 'free') {
          if (q.length >= 10) {
            const p = new Path2D(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let i = 0; i < q.length; i += 2) { if (i) p.lineTo(q[i], q[i + 1]); else p.moveTo(q[i], q[i + 1]); x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]); y0 = Math.min(y0, q[i + 1]); y1 = Math.max(y1, q[i + 1]); }
            p.closePath(); sel = p; box = [x0, y0, x1, y1];
          }
        } else if (box && (box[2] - box[0] < 4 || box[3] - box[1] < 4)) { sel = null; box = null; }
        live = null; View.request();
      },
      pointerCancel: () => { live = null; View.request(); },
      overlay: (ctx, v) => {
        ctx.save();
        ctx.translate(v.tx, v.ty); ctx.scale(v.scale, v.scale);
        const lw = 1 / v.scale;
        if (live && mem.kind === 'free' && live.pts.length > 2) {
          ctx.beginPath(); for (let i = 0; i < live.pts.length; i += 2) { if (i) ctx.lineTo(live.pts[i], live.pts[i + 1]); else ctx.moveTo(live.pts[i], live.pts[i + 1]); }
          ctx.lineWidth = 3 * lw; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(); ctx.lineWidth = 1.6 * lw; ctx.strokeStyle = '#fff'; ctx.setLineDash([7 * lw, 5 * lw]); ctx.stroke();
        } else if (sel) {
          const dark = new Path2D();
          if (inverted) dark.addPath(sel); else { dark.rect(0, 0, W, H); dark.addPath(sel); }
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill(dark, inverted ? 'nonzero' : 'evenodd');
          ctx.lineWidth = 3 * lw; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(sel); ctx.lineWidth = 1.6 * lw; ctx.strokeStyle = '#fff'; ctx.setLineDash([7 * lw, 5 * lw]); ctx.stroke(sel);
        }
        ctx.restore();
      },
      apply: () => {
        if (!sel) return;
        const t = lift();
        if (!t) return;
        const made = Layers.image(t.canvas, { name: 'Copy', x: t.x + t.canvas.width / 2, y: t.y + t.canvas.height / 2 });
        Doc.layers.splice(Doc.index(l.id) + 1, 0, made); Doc.selectedId = made.id;
        History.commit();
      }
    };
    UI.enterMode(m);
  };

  /* ============================ STRETCH ============================ */
  StretchTool.mem = { tool: 'push', size: 80, strength: 60 };
  StretchTool.open = function (target) {
    const l = pick(target);
    if (!l) return;
    const mem = StretchTool.mem, full = l.bitmap, pv = U.fitInside(full, PV), W = pv.width, H = pv.height;
    // a net laid over the picture: the knots are moved, the picture is drawn piece by piece between them
    const CELL = Math.max(10, Math.round(Math.max(W, H) / 46)), nx = Math.max(2, Math.ceil(W / CELL)), ny = Math.max(2, Math.ceil(H / CELL)), cw = W / nx, ch = H / ny, NV = (nx + 1) * (ny + 1);
    const SX = new Float32Array(NV), SY = new Float32Array(NV);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { SX[j * (nx + 1) + i] = i * cw; SY[j * (nx + 1) + i] = j * ch; }
    let DX = SX.slice(), DY = SY.slice();
    const undo = [], redo = [];
    const out = U.canvas(W, H), ox = out.getContext('2d');
    let live = null, finger = null, showing = true, raf = 0, hintUntil = 0;
    /* draw the picture through the net onto ctx (k = px of that canvas per px of the preview) */
    function drawNet(ctx, img, k) {
      const sw = img.width / nx, sh = img.height / ny;                    // size of one piece in the source picture
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);       // the unmoved picture first; moved pieces go on top
      const tri = (ax, ay, bx, by, cx2, cy2, a, b, c, d, e, f) => {
        const mx = (ax + bx + cx2) / 3, my = (ay + by + cy2) / 3, g = 1.04;          // a hair bigger, so no seams show between the pieces
        ctx.save(); ctx.beginPath();
        ctx.moveTo(mx + (ax - mx) * g, my + (ay - my) * g); ctx.lineTo(mx + (bx - mx) * g, my + (by - my) * g); ctx.lineTo(mx + (cx2 - mx) * g, my + (cy2 - my) * g);
        ctx.closePath(); ctx.clip();
        ctx.setTransform(a, b, c, d, e, f); ctx.drawImage(img, 0, 0);
        ctx.restore();
      };
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const v0 = j * (nx + 1) + i, v1 = v0 + 1, v2 = v0 + nx + 1, v3 = v2 + 1;
        if (DX[v0] === SX[v0] && DY[v0] === SY[v0] && DX[v1] === SX[v1] && DY[v1] === SY[v1] && DX[v2] === SX[v2] && DY[v2] === SY[v2] && DX[v3] === SX[v3] && DY[v3] === SY[v3]) continue;
        const x0 = DX[v0] * k, y0 = DY[v0] * k, x1 = DX[v1] * k, y1 = DY[v1] * k, x2 = DX[v2] * k, y2 = DY[v2] * k, x3 = DX[v3] * k, y3 = DY[v3] * k, u = i * sw, w = j * sh;
        let a = (x1 - x0) / sw, b = (y1 - y0) / sw, c = (x2 - x0) / sh, d = (y2 - y0) / sh;
        tri(x0, y0, x1, y1, x2, y2, a, b, c, d, x0 - a * u - c * w, y0 - b * u - d * w);
        a = (x3 - x2) / sw; b = (y3 - y2) / sw; c = (x3 - x1) / sh; d = (y3 - y1) / sh;
        tri(x1, y1, x3, y3, x2, y2, a, b, c, d, x3 - a * (u + sw) - c * (w + sh), y3 - b * (u + sw) - d * (w + sh));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const moved = () => { for (let i = 0; i < NV; i++) if (DX[i] !== SX[i] || DY[i] !== SY[i]) return true; return false; };
    const show = () => { if (showing && moved()) { drawNet(ox, pv, 1); View.overrides.set(l.id, out); } else View.overrides.delete(l.id); View.request(); };
    const radius = () => Math.max(6, mem.size / 2 / (View.scale * Math.abs(l.scaleX)) * (W / full.width));      // in px of the preview
    /* move the knots near (cx, cy). (mx, my): how far the finger went (only for "push") */
    function work(cx, cy, mx, my) {
      const r = radius(), r2 = r * r, st = mem.strength / 100, t = mem.tool;
      for (let i = 0; i < NV; i++) {
        const dx = DX[i] - cx, dy = DY[i] - cy, q = dx * dx + dy * dy;
        if (q >= r2) continue;
        const f = Math.pow(1 - q / r2, 2);
        if (t === 'push') { DX[i] += mx * f * (0.4 + st * 0.6); DY[i] += my * f * (0.4 + st * 0.6); }
        else if (t === 'swirlR' || t === 'swirlL') { const a = (t === 'swirlR' ? 1 : -1) * 0.1 * st * f, c = Math.cos(a), s = Math.sin(a); DX[i] = cx + dx * c - dy * s; DY[i] = cy + dx * s + dy * c; }
        else if (t === 'pinch') { DX[i] -= dx * 0.07 * st * f; DY[i] -= dy * 0.07 * st * f; }
        else if (t === 'bloat') { DX[i] += dx * 0.07 * st * f; DY[i] += dy * 0.07 * st * f; }
        else { DX[i] += (SX[i] - DX[i]) * 0.25 * f; DY[i] += (SY[i] - DY[i]) * 0.25 * f; if (Math.abs(DX[i] - SX[i]) < 0.05 && Math.abs(DY[i] - SY[i]) < 0.05) { DX[i] = SX[i]; DY[i] = SY[i]; } }
      }
    }
    const tick = () => {            // swirl, squeeze, inflate and restore go on while the finger rests
      raf = 0;
      if (!live || UI.mode() !== m) return;
      if (mem.tool !== 'push') { work(live.x, live.y, 0, 0); show(); }
      raf = requestAnimationFrame(tick);
    };
    const prev = () => (W / full.width);
    const hintText = note('');
    const HINTS = { push: 'Push the picture with your finger.', swirlR: 'Hold to twist to the right.', swirlL: 'Hold to twist to the left.', pinch: 'Hold to pull the picture together.', bloat: 'Hold to blow the picture up.', restore: 'Rub to bring the picture back.' };
    function pickTool(id) { mem.tool = id; UI.markActive(id); hintText.textContent = HINTS[id]; }
    const ring = () => { hintUntil = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    const m = {
      title: 'Stretch',
      items: [['push', 'Push', 'push'], ['swirlR', 'Swirl right', 'swirl'], ['swirlL', 'Swirl left', 'swirl'], ['pinch', 'Squeeze', 'pinch'], ['bloat', 'Inflate', 'bloat'], ['restore', 'Restore', 'restore']]
        .map((t) => ({ id: t[0], icon: t[2], label: t[1], onTap: () => pickTool(t[0]) })),
      panel: pad(
        UI.slider({ label: 'Size', min: 20, max: 220, value: mem.size, onInput: (v) => { mem.size = v; ring(); } }),
        UI.slider({ label: 'Strength', min: 10, max: 100, value: mem.strength, onInput: (v) => { mem.strength = v; } }),
        hintText),
      compare: compareOf((on) => { showing = on; show(); }),
      history: {
        canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
        undo: () => { if (undo.length) { redo.push([DX, DY]); const s = undo.pop(); DX = s[0]; DY = s[1]; show(); } },
        redo: () => { if (redo.length) { undo.push([DX, DY]); const s = redo.pop(); DX = s[0]; DY = s[1]; show(); } }
      },
      pointerDown: (p) => {
        finger = p;
        const q = toBmp(l, View.toDoc(p[0], p[1])), k = prev();
        undo.push([DX.slice(), DY.slice()]); if (undo.length > 20) undo.shift(); redo.length = 0;
        live = { x: q[0] * k, y: q[1] * k };
        if (!raf) raf = requestAnimationFrame(tick);
      },
      pointerMove: (p) => {
        finger = p;
        if (!live) return;
        const q = toBmp(l, View.toDoc(p[0], p[1])), k = prev(), x = q[0] * k, y = q[1] * k;
        if (mem.tool === 'push') { work(live.x, live.y, x - live.x, y - live.y); show(); }
        live.x = x; live.y = y;
      },
      pointerUp: () => { finger = null; live = null; UI.refreshTop(); show(); },
      pointerCancel: () => { finger = null; if (live) { live = null; const s = undo.pop(); if (s) { DX = s[0]; DY = s[1]; } show(); } },
      overlay: (ctx, v) => { if (finger || Date.now() < hintUntil) RetouchTool._ring(ctx, v, finger, mem.size / 2); },
      apply: async () => {
        if (!moved()) return;
        await U.busy(() => {
          const c = U.canvas(full.width, full.height);
          drawNet(c.getContext('2d'), full, full.width / W);
          l.bitmap = c; delete l.shape; History.commit();
        }, 'Applying…');
      }
    };
    UI.enterMode(m);
    pickTool(mem.tool);
  };

  /* ============================ DISPERSION ============================ */
  DispersionTool.mem = { size: 30, dist: 55, angle: 0, brush: 70, seed: 5 };
  DispersionTool.open = function (target) {
    const l = pick(target);
    if (!l) return;
    const mem = DispersionTool.mem, full = l.bitmap, pv = U.readable(U.fitInside(full, PV)), W = pv.width, H = pv.height, cut = !(l.base || solid(pv));
    const mask = U.canvas(W, H), mx = mask.getContext('2d', { willReadFrequently: true });      // the part that flies away (painted by the user)
    let live = null, finger = null, erase = false, painted = false, res = null, showing = true, hintUntil = 0;
    /* -> { c, ox, oy } : the picture with its pieces flying; (ox, oy) = where the old picture sits inside it */
    function run(c) {
      const k = c.width / W, w = c.width, hh = c.height, R = U.rng(mem.seed);
      const D = mem.dist / 100 * Math.max(w, hh) * 0.55, a = mem.angle * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), S = Math.max(2, mem.size / 100 * Math.max(w, hh) * 0.045);
      const md = mx.getImageData(0, 0, W, H).data;
      const inMask = [];
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (md[(y * W + x) * 4 + 3] > 80) inMask.push(x, y);
      if (!inMask.length) return null;
      const m = cut ? Math.ceil(D + S * 2) : 0;                                       // room around a cut-out for the pieces
      const out = U.canvas(w + 2 * m, hh + 2 * m), o = out.getContext('2d');
      o.drawImage(c, m, m);
      const count = Math.round(U.clamp(inMask.length / 2 * 4 * k * k / (S * S) * 2.6, 60, 2600));
      const parts = [];
      for (let i = 0; i < count; i++) {
        const j = Math.floor(R() * inMask.length / 2) * 2, px = (inMask[j] + R() * 2) * k, py = (inMask[j + 1] + R() * 2) * k;
        parts.push({ x: px, y: py, s: S * (0.45 + R() * R() * 1.7), t: Math.pow(R(), 1.6), side: (R() - 0.5), spin: (R() - 0.5) * 1.2, hole: R() < 0.5 });
      }
      if (cut) {                                                                       // the part itself thins out where pieces left it
        o.save(); o.globalCompositeOperation = 'destination-out';
        for (const q of parts) if (q.hole) { o.globalAlpha = 0.35 + q.t * 0.65; o.fillRect(m + q.x - q.s / 2, m + q.y - q.s / 2, q.s, q.s); }
        o.restore();
      }
      parts.sort((p, q) => q.t - p.t);
      for (const q of parts) {
        const dx = (ux * q.t - uy * q.side * 0.5 * q.t) * D, dy = (uy * q.t + ux * q.side * 0.5 * q.t) * D, sc = 1 - q.t * 0.55;
        o.save(); o.globalAlpha = 1 - q.t * 0.8;
        o.translate(m + q.x + dx, m + q.y + dy); o.rotate(q.spin * q.t); o.scale(sc, sc);
        o.drawImage(c, q.x - q.s / 2, q.y - q.s / 2, q.s, q.s, -q.s / 2, -q.s / 2, q.s, q.s);
        o.restore();
      }
      return { c: out, ox: m, oy: m };
    }
    const update = U.rafThrottle(() => {
      if (UI.mode() !== m) return;
      res = showing && painted && !live ? run(pv) : null;
      View.overrides.delete(l.id); View.hide.delete(l.id);
      if (res && !cut) View.overrides.set(l.id, res.c); else if (res) View.hide.add(l.id);
      View.request();
    });
    const radius = () => Math.max(3, mem.brush / 2 / (View.scale * Math.abs(l.scaleX)) * (W / full.width));
    const ring = () => { hintUntil = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    const m = {
      title: 'Dispersion',
      panel: pad(
        UI.chips([['paint', 'Mark the part'], ['erase', 'Unmark']], 'paint', (v) => { erase = v === 'erase'; }),
        UI.slider({ label: 'Brush', min: 15, max: 200, value: mem.brush, onInput: (v) => { mem.brush = v; ring(); } }),
        UI.slider({ label: 'Distance', min: 5, max: 100, value: mem.dist, onInput: (v) => { mem.dist = v; update(); } }),
        UI.slider({ label: 'Pieces', min: 5, max: 100, value: mem.size, onInput: (v) => { mem.size = v; update(); } }),
        UI.slider({ label: 'Direction', min: 0, max: 360, value: mem.angle, fmt: (v) => Math.round(v) + '°', onInput: (v) => { mem.angle = v; update(); } }),
        note('Rub over the part that should fly away (an edge of the person or thing works best).')),
      compare: compareOf((on) => { showing = on; update(); }),
      pointerDown: (p) => {
        finger = p;
        const q = toBmp(l, View.toDoc(p[0], p[1])), k = W / full.width;
        live = { x: q[0] * k, y: q[1] * k, r: radius(), last: p };
        RetouchTool._softLine(mx, live.x, live.y, live.x, live.y, live.r, 30, erase); painted = true;
        update();
      },
      pointerMove: (p) => {
        finger = p;
        if (!live || Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 2) { View.request(); return; }
        live.last = p;
        const q = toBmp(l, View.toDoc(p[0], p[1])), k = W / full.width, x = q[0] * k, y = q[1] * k;
        RetouchTool._softLine(mx, live.x, live.y, x, y, live.r, 30, erase);
        live.x = x; live.y = y; View.request();
      },
      pointerUp: () => { finger = null; live = null; update(); },
      pointerCancel: () => { finger = null; live = null; update(); },
      drawDoc: (ctx) => {
        const k = full.width / W;
        ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rotation); ctx.scale(l.scaleX * (l.flipH ? -1 : 1), l.scaleY * (l.flipV ? -1 : 1));
        if (res && cut) { ctx.globalAlpha = l.opacity; ctx.drawImage(res.c, -full.width / 2 - res.ox * k, -full.height / 2 - res.oy * k, res.c.width * k, res.c.height * k); }
        if (live || !res) { ctx.globalAlpha = 0.45; ctx.drawImage(tinted(), -full.width / 2, -full.height / 2, full.width, full.height); }      // the marked part in red while painting
        ctx.restore();
      },
      overlay: (ctx, v) => { if (finger || Date.now() < hintUntil) RetouchTool._ring(ctx, v, finger, mem.brush / 2, 'rgba(255,60,90,.25)'); },
      apply: async () => {
        if (!painted) return;
        await U.busy(() => {
          const r = run(full);
          if (!r) return;
          if (cut) { const t = U.trimCanvas(r.c, 1); if (!t) return; LayerCrop._replace(l, t.canvas, t.x + t.canvas.width / 2 - r.ox, t.y + t.canvas.height / 2 - r.oy); }
          else l.bitmap = r.c;
          delete l.shape; History.commit();
        }, 'Applying…');
      }
    };
    const red = U.canvas(W, H), rx = red.getContext('2d');
    function tinted() { rx.globalCompositeOperation = 'copy'; rx.drawImage(mask, 0, 0); rx.globalCompositeOperation = 'source-in'; rx.fillStyle = '#ff2d55'; rx.fillRect(0, 0, W, H); rx.globalCompositeOperation = 'source-over'; return red; }
    UI.enterMode(m);
  };

  /* ============================ REPLAY ============================ */
  /* a look = steps that are done one after the other, each one its own undo step:
     ['adjust', {…}] · ['fx', id, amount] · ['mask', id, opacity, blend] · ['frame', id, colour, size] */
  const LOOKS = [
    { id: 'golden', name: 'Golden hour', steps: [['adjust', { temp: 36, saturation: 16, contrast: 10 }], ['mask', 'sun', 80, 'screen'], ['mask', 'vignette', 55, 'source-over']] },
    { id: 'dream', name: 'Dreamy', steps: [['adjust', { brightness: 8, contrast: -10, saturation: 12 }], ['mask', 'bokeh1', 85, 'screen'], ['mask', 'leak2', 55, 'screen']] },
    { id: 'pola', name: 'Polaroid', steps: [['adjust', { contrast: 8, temp: 14, saturation: -10 }], ['mask', 'leak1', 35, 'screen'], ['frame', 'polaroid', '#ffffff', 5]] },
    { id: 'film', name: 'Old film', steps: [['adjust', { saturation: -55, temp: 40, contrast: 12 }], ['mask', 'dust', 80, 'screen'], ['mask', 'vignette', 70, 'source-over'], ['frame', 'film', '#111111', 5]] },
    { id: 'noir', name: 'Noir', steps: [['adjust', { saturation: -100, contrast: 30, clarity: 25 }], ['mask', 'vignette', 85, 'source-over'], ['frame', 'line', '#ffffff', 4]] },
    { id: 'neon', name: 'Neon night', steps: [['adjust', { contrast: 18, saturation: 32, temp: -22 }], ['mask', 'leak2', 80, 'screen'], ['mask', 'sparkle', 90, 'screen']] },
    { id: 'winter', name: 'Winter', steps: [['adjust', { temp: -32, brightness: 8, saturation: -18 }], ['mask', 'snow', 90, 'source-over']] },
    { id: 'love', name: 'Love', steps: [['adjust', { temp: 16, saturation: 12, brightness: 4 }], ['mask', 'leak3', 55, 'screen'], ['mask', 'hearts', 100, 'screen']] },
    { id: 'rain', name: 'Rainy day', steps: [['adjust', { saturation: -32, contrast: 12, temp: -14 }], ['mask', 'rain', 85, 'screen'], ['mask', 'vignette', 70, 'source-over']] },
    { id: 'pop', name: 'Pop', steps: [['adjust', { contrast: 22, saturation: 42, clarity: 30 }], ['frame', 'stamp', '#ffffff', 5]] }
  ];
  const STEP_NAME = { adjust: 'Light and colour', fx: 'Effect', mask: 'Light overlay', frame: 'Frame' };
  /* one step drawn onto a small canvas (for the preview cards) */
  function previewStep(c, st) {
    const x = c.getContext('2d'), w = c.width, hh = c.height;
    if (st[0] === 'adjust') { const img = IP.read(c); IP.adjust(img, img, st[1], st[1].clarity ? IP.clarityMap(c) : null); x.putImageData(img, 0, 0); }
    else if (st[0] === 'mask') { x.save(); x.globalAlpha = st[2] / 100; x.globalCompositeOperation = st[3]; x.drawImage(MaskTool.paint(U.canvas(w, hh), st[1], 7), 0, 0); x.restore(); }
    else if (st[0] === 'frame') x.drawImage(FrameTool.paint(U.canvas(w, hh), st[1], st[2], st[3] + 2), 0, 0);
  }
  function doStep(st) {
    if (st[0] === 'adjust') {
      const l = Doc.targetImage();
      if (!l) return;
      const img = IP.read(l.bitmap);
      IP.adjust(img, img, st[1], st[1].clarity ? IP.clarityMap(l.bitmap) : null);
      l.bitmap = IP.write(img); delete l.shape;
    } else if (st[0] === 'mask') {
      const k = Math.min(1, 1100 / Math.max(Doc.width, Doc.height)), c = MaskTool.paint(U.canvas(Doc.width * k, Doc.height * k), st[1], 7);
      const l = Layers.image(c, { name: 'Mask', x: Doc.width / 2, y: Doc.height / 2, blend: st[3], opacity: st[2] / 100, locked: true });
      l.scaleX = Doc.width / c.width; l.scaleY = Doc.height / c.height; Doc.add(l);
    } else if (st[0] === 'frame') {
      const c = FrameTool.paint(U.canvas(Doc.width, Doc.height), st[1], st[2], st[3]);
      Doc.add(Layers.image(c, { name: 'Frame', x: Doc.width / 2, y: Doc.height / 2 }));
    }
    History.commit(); View.request();
  }
  ReplayTool.run = async function (look) {
    Doc.select(null);
    for (let i = 0; i < look.steps.length; i++) {
      if (!Doc.open) return;
      U.toast((i + 1) + ' / ' + look.steps.length + ' · ' + STEP_NAME[look.steps[i][0]], 1500);
      await U.nextFrame();
      try { doStep(look.steps[i]); } catch (e) { console.error(e); }
      await new Promise((r) => setTimeout(r, 520));
    }
    U.toast('“' + look.name + '” is done. Undo goes back one step at a time.', 3200);
  };
  ReplayTool.open = function () {
    if (!Doc.targetImage()) { U.toast('Add a photo first'); return; }
    const grid = h('div', { class: 'flare-grid' });
    const sh = UI.sheet('Replay', h('div', null, grid, h('p', { class: 'panel-note', text: 'A ready-made look is applied step by step. Every step can be undone or changed afterwards.' })));
    const small = Doc.flatten({ maxDim: 150, fill: '#1a1a1a' });
    for (const look of LOOKS) {
      const cv = U.canvas(150, 150), x = cv.getContext('2d'), s = Math.max(150 / small.width, 150 / small.height);
      x.drawImage(small, (150 - small.width * s) / 2, (150 - small.height * s) / 2, small.width * s, small.height * s);
      try { for (const st of look.steps) previewStep(cv, st); } catch (e) { console.error(e); }
      const b = h('button', { class: 'flare-cell', type: 'button', 'data-id': look.id }, cv, h('span', { text: look.name }));
      U.onTap(b, () => { sh.close(); ReplayTool.run(look); });
      grid.appendChild(b);
    }
  };
  ReplayTool._looks = LOOKS;
})();
