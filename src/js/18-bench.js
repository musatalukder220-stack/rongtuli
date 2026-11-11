'use strict';
/* ============================================================
 * 18-bench.js : tools that work on ONE picture (an added photo,
 * a sticker, or the background photo), shown alone and upright:
 *   LayerCrop  - cut a rectangle out of an added photo
 *   ShapeCrop  - cut it to a circle, star, heart …
 *   Cutout     - Remove BG / Cutout / Free Crop / Eraser:
 *                Auto, tap a colour, rub out, bring back, draw around
 * "Auto" has two ways:
 *   AI      - where the add-on in the folder "ai" is there (see
 *             18b-aicut.js): finds the person or thing by itself
 *   Colour  - everywhere: removes the colours it finds along the
 *             edge of the picture, as far as they touch the edge
 * ============================================================ */
const LayerCrop = {};
const ShapeCrop = {};
const Cutout = { mem: { tol: 24, size: 36, soft: 30, bring: false, inside: 'keep', ai: 'auto' } };
(function () {
  const h = U.h;
  const RATIOS = [['free', 'Free'], ['orig', 'Original'], ['1:1', '1:1'], ['4:5', '4:5'], ['5:4', '5:4'], ['3:4', '3:4'], ['4:3', '4:3'],
    ['9:16', '9:16'], ['16:9', '16:9'], ['2:3', '2:3'], ['3:2', '3:2']];

  /* The picture (w × hh px) is laid upright into the document rectangle, so the zoom and pan of the View keep working. */
  function bench(w, hh) {
    const k = Math.min(Doc.width / w, Doc.height / hh), ox = (Doc.width - w * k) / 2, oy = (Doc.height - hh * k) / 2;
    return {
      w: w, h: hh,
      toBmp: (p) => { const d = View.toDoc(p[0], p[1]); return [(d[0] - ox) / k, (d[1] - oy) / k]; },      // screen point -> px of the picture
      toView: (x, y) => View.toView(ox + x * k, oy + y * k),
      px: () => View.scale * k,                                                                              // screen px per picture px
      /* checkerboard + the picture(s); returns where the picture is on screen [x, y, w, h] */
      draw: (ctx, v, pics) => {
        const a = v.toView(ox, oy), s = v.scale * k, r = [a[0], a[1], w * s, hh * s];
        ctx.save();
        ctx.fillStyle = v.checker(ctx); ctx.fillRect(r[0], r[1], r[2], r[3]);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = s < 1 ? 'high' : 'low';
        for (const q of pics) { if (!q) continue; ctx.globalAlpha = q.alpha == null ? 1 : q.alpha; ctx.drawImage(q.c || q, r[0], r[1], r[2], r[3]); }
        ctx.restore();
        return r;
      }
    };
  }
  /* Put a new picture into the layer. (cx, cy) = where the centre of the new picture was inside the old one,
     so what is left stays exactly where it was on the canvas. */
  function replace(l, c, cx, cy) {
    const dx = (cx - l.bitmap.width / 2) * l.scaleX * (l.flipH ? -1 : 1), dy = (cy - l.bitmap.height / 2) * l.scaleY * (l.flipV ? -1 : 1);
    const co = Math.cos(l.rotation), si = Math.sin(l.rotation);
    l.x += dx * co - dy * si; l.y += dx * si + dy * co;
    l.bitmap = c;
    delete l.shape;
  }
  function target(t) {
    const l = t && t.type === 'image' ? t : Doc.targetImage();
    if (!l) U.toast('Add a photo first');
    return l;
  }

  /* ---------- a frame with corner and side handles, inside 0..W × 0..H (px of the picture) ---------- */
  function Frame(W, H, b) {
    const MIN = Math.min(16, W, H);
    const f = { r: { x: 0, y: 0, w: W, h: H }, aspect: null, drag: null };
    /* a = width / height or null (free); part = how much of the picture the new frame takes */
    f.setAspect = function (a, part) {
      f.aspect = a || null;
      if (!a) return;
      part = part || 1;
      let w = W * part, hh = w / a;
      if (hh > H * part) { hh = H * part; w = hh * a; }
      f.r = { x: (W - w) / 2, y: (H - hh) / 2, w: w, h: hh };
    };
    function hit(p) {
      const a = b.toView(f.r.x, f.r.y), e = b.toView(f.r.x + f.r.w, f.r.y + f.r.h), C = 26, Eg = 20;
      const nearL = Math.abs(p[0] - a[0]) < C, nearR = Math.abs(p[0] - e[0]) < C, nearT = Math.abs(p[1] - a[1]) < C, nearB = Math.abs(p[1] - e[1]) < C;
      const inX = p[0] > a[0] - Eg && p[0] < e[0] + Eg, inY = p[1] > a[1] - Eg && p[1] < e[1] + Eg;
      if ((nearL || nearR) && (nearT || nearB)) {
        const left = nearL && (!nearR || Math.abs(p[0] - a[0]) <= Math.abs(p[0] - e[0]));
        const top = nearT && (!nearB || Math.abs(p[1] - a[1]) <= Math.abs(p[1] - e[1]));
        return { l: left, r: !left, t: top, b: !top };
      }
      if (inY && Math.abs(p[0] - a[0]) < Eg) return { l: true };
      if (inY && Math.abs(p[0] - e[0]) < Eg) return { r: true };
      if (inX && Math.abs(p[1] - a[1]) < Eg) return { t: true };
      if (inX && Math.abs(p[1] - e[1]) < Eg) return { b: true };
      if (p[0] > a[0] && p[0] < e[0] && p[1] > a[1] && p[1] < e[1]) return 'move';
      return null;
    }
    function resize(k, d, o) {
      const corner = (k.l || k.r) && (k.t || k.b), aspect = f.aspect;
      if (!aspect) {
        let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
        if (k.l) x0 = U.clamp(d[0], 0, x1 - MIN);
        if (k.r) x1 = U.clamp(d[0], x0 + MIN, W);
        if (k.t) y0 = U.clamp(d[1], 0, y1 - MIN);
        if (k.b) y1 = U.clamp(d[1], y0 + MIN, H);
        f.r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        return;
      }
      if (corner) {
        const ax = k.l ? o.x + o.w : o.x, ay = k.t ? o.y + o.h : o.y;        // the corner that stays put
        const maxW = k.l ? ax : W - ax, maxH = k.t ? ay : H - ay;
        let w = Math.max(Math.abs(d[0] - ax), Math.abs(d[1] - ay) * aspect);
        w = Math.min(w, maxW, maxH * aspect);
        w = Math.max(w, Math.min(MIN * Math.max(1, aspect), maxW, maxH * aspect));
        const hh = w / aspect;
        f.r = { x: k.l ? ax - w : ax, y: k.t ? ay - hh : ay, w: w, h: hh };
      } else if (k.l || k.r) {
        const ax = k.l ? o.x + o.w : o.x, cy = o.y + o.h / 2;
        const maxW = Math.min(k.l ? ax : W - ax, 2 * Math.min(cy, H - cy) * aspect);
        const w = U.clamp(Math.abs(d[0] - ax), Math.min(MIN, maxW), maxW), hh = w / aspect;
        f.r = { x: k.l ? ax - w : ax, y: cy - hh / 2, w: w, h: hh };
      } else {
        const ay = k.t ? o.y + o.h : o.y, cx = o.x + o.w / 2;
        const maxH = Math.min(k.t ? ay : H - ay, 2 * Math.min(cx, W - cx) / aspect);
        const hh = U.clamp(Math.abs(d[1] - ay), Math.min(MIN, maxH), maxH), w = hh * aspect;
        f.r = { x: cx - w / 2, y: k.t ? ay - hh : ay, w: w, h: hh };
      }
    }
    f.down = (p) => { const k = hit(p); f.drag = k ? { k: k, start: b.toBmp(p), o: Object.assign({}, f.r) } : null; };
    f.move = (p) => {
      if (!f.drag) return;
      const d = b.toBmp(p);
      if (f.drag.k === 'move') {
        f.r.x = U.clamp(f.drag.o.x + d[0] - f.drag.start[0], 0, W - f.r.w);
        f.r.y = U.clamp(f.drag.o.y + d[1] - f.drag.start[1], 0, H - f.r.h);
      } else resize(f.drag.k, d, f.drag.o);
    };
    f.up = () => { f.drag = null; };
    f.cancel = () => { if (f.drag) { f.r = f.drag.o; f.drag = null; } };
    /* the frame on screen: [x0, y0, x1, y1] */
    f.view = () => { const a = b.toView(f.r.x, f.r.y), e = b.toView(f.r.x + f.r.w, f.r.y + f.r.h); return [a[0], a[1], e[0], e[1]]; };
    f.draw = function (ctx, thirds) {
      const q = f.view(), x0 = q[0], y0 = q[1], x1 = q[2], y1 = q[3];
      ctx.save();
      if (thirds) {
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 1; i < 3; i++) { const gx = x0 + (x1 - x0) * i / 3, gy = y0 + (y1 - y0) * i / 3; ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); }
        ctx.stroke();
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const L = Math.min(22, (x1 - x0) / 3, (y1 - y0) / 3), t = 4;
      ctx.lineWidth = t; ctx.lineCap = 'square'; ctx.beginPath();
      for (const c of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
        const cx = c[0] - c[2] * t / 2, cy = c[1] - c[3] * t / 2;
        ctx.moveTo(cx + c[2] * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + c[3] * L);
      }
      ctx.stroke();
      ctx.restore();
    };
    /* whole numbers, inside the picture */
    f.rect = function () {
      const x = U.clamp(Math.round(f.r.x), 0, W - 1), y = U.clamp(Math.round(f.r.y), 0, H - 1);
      return { x: x, y: y, w: U.clamp(Math.round(f.r.w), 1, W - x), h: U.clamp(Math.round(f.r.h), 1, H - y) };
    };
    return f;
  }
  LayerCrop._bench = bench; LayerCrop._Frame = Frame; LayerCrop._replace = replace;
  const ratioChips = (f, W, H, after) => UI.chips(RATIOS, 'free', (v) => {
    if (v === 'free') f.aspect = null;
    else if (v === 'orig') f.setAspect(W / H);
    else { const q = v.split(':'); f.setAspect(+q[0] / +q[1]); }
    after();
  });

  /* ============================ CROP (one added photo) ============================ */
  LayerCrop.open = function (t) {
    const l = target(t);
    if (!l) return;
    if (l.base) { CropTool.open(); return; }                 // the background photo is cropped together with the canvas
    const bm = l.bitmap, W = bm.width, H = bm.height, b = bench(W, H), f = Frame(W, H, b);
    const info = h('div', { class: 'crop-info' });
    const show = () => { const r = f.rect(); info.textContent = r.w + ' × ' + r.h + ' px'; View.request(); };
    const m = {
      title: 'Crop photo',
      panel: h('div', { class: 'panel-pad' }, info, ratioChips(f, W, H, show)),
      render: (ctx, v) => {
        const r = b.draw(ctx, v, [bm]), q = f.view();
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.rect(q[0], q[1], q[2] - q[0], q[3] - q[1]); ctx.fill('evenodd'); ctx.restore();
        f.draw(ctx, true);
      },
      pointerDown: (p) => f.down(p),
      pointerMove: (p) => { f.move(p); show(); },
      pointerUp: () => f.up(),
      pointerCancel: () => { f.cancel(); show(); },
      cancel: () => View.fit(),
      apply: () => {
        const r = f.rect();
        View.fit();
        if (r.x === 0 && r.y === 0 && r.w === W && r.h === H) return;
        const c = U.canvas(r.w, r.h);
        c.getContext('2d').drawImage(bm, -r.x, -r.y);
        replace(l, c, r.x + r.w / 2, r.y + r.h / 2);
        History.commit();
      }
    };
    View.fit(); show();
    UI.enterMode(m);
  };

  /* ============================ SHAPE CROP ============================ */
  /* Like the video: pick a group, tap a shape — then the shape sits ON the picture with a frame you can
     drag and stretch, a ‹ › pair that walks through the shapes, a Close (nothing changes) and a ✓ (apply).
     Undo / Redo in the middle of the top bar take back a change of shape or of the frame.
     Apply cuts the picture to the shape inside the frame: what is outside is trimmed off, nothing is added. */
  ShapeCrop.mem = { shape: 'circle', lock: true };
  ShapeCrop.open = function (t) {
    const l = target(t);
    if (!l) return;
    const bm = l.bitmap, W = bm.width, H = bm.height, b = bench(W, H), f = Frame(W, H, b), mem = ShapeCrop.mem;
    const past = [], future = [];                     // the shape + frame as they were, step by step
    let picker = null;
    const snap = () => ({ shape: mem.shape, lock: mem.lock, r: Object.assign({}, f.r) });
    const same = (a, c) => a.shape === c.shape && a.lock === c.lock &&
      Math.abs(a.r.x - c.r.x) < 0.01 && Math.abs(a.r.y - c.r.y) < 0.01 && Math.abs(a.r.w - c.r.w) < 0.01 && Math.abs(a.r.h - c.r.h) < 0.01;
    const keep = (before) => {
      if (same(before, snap())) return;               // nothing changed: no undo step
      past.push(before); if (past.length > 30) past.shift(); future.length = 0; UI.refreshTop();
    };
    const fitShape = () => { if (mem.lock) f.setAspect(Shapes.ratio(mem.shape), 0.9); else f.aspect = null; };
    const pickShape = (id) => {
      const before = snap();
      mem.shape = id;
      fitShape(); keep(before); show();
      View.request();
    };
    const buildPicker = (node) => {
      const p = node || Shapes.picker(mem.shape, pickShape);
      picker = p;
      const sway = UI.chips([['lock', 'Keep its form'], ['free', 'Stretch freely']], mem.lock ? 'lock' : 'free', (v) => {
        const before = snap();
        mem.lock = v === 'lock'; fitShape(); keep(before); show();
        View.request();
      });
      return h('div', { class: 'panel-pad' }, p, sway, info);
    };
    const stepShape = (d) => {
      const id = Shapes.step(mem.shape, d);
      pickShape(id);
      if (picker) picker.setShape(id);
    };
    const info = h('div', { class: 'crop-info' });
    const name = h('span', { class: 'sc-name' });
    const show = () => {
      const r = f.rect();
      info.textContent = (mem.lock ? 'Keeps its form' : 'Stretched') + ' · ' + r.w + ' × ' + r.h + ' px';
      name.textContent = Shapes.get(mem.shape).name;
    };
    /* the walk arrows ‹ › and the name of the shape, in the bar above the shapes (like the video) */
    const bar = h('div', { class: 'sc-bar' },
      UI.tbtn('chevL', 'Previous shape', () => stepShape(-1)),
      name,
      UI.tbtn('chevL', 'Next shape', () => stepShape(1), 'flip'));
    const m = {
      title: 'Shape Crop',
      bar: bar,
      panel: buildPicker(),
      history: {
        canUndo: () => past.length > 0, canRedo: () => future.length > 0,
        undo: () => {
          if (!past.length) return;
          future.push(snap());
          const s0 = past.pop();
          mem.shape = s0.shape; mem.lock = s0.lock; f.r = Object.assign({}, s0.r); f.aspect = s0.lock ? Shapes.ratio(s0.shape) : null;
          if (picker) picker.setShape(s0.shape);
          UI.setPanel(buildPicker(picker)); show(); View.request();
        },
        redo: () => {
          if (!future.length) return;
          past.push(snap());
          const s0 = future.pop();
          mem.shape = s0.shape; mem.lock = s0.lock; f.r = Object.assign({}, s0.r); f.aspect = s0.lock ? Shapes.ratio(s0.shape) : null;
          if (picker) picker.setShape(s0.shape);
          UI.setPanel(buildPicker(picker)); show(); View.request();
        }
      },
      render: (ctx, v) => {
        const r = b.draw(ctx, v, [bm]), q = f.view();
        const sp = Shapes.path(mem.shape, q[0], q[1], q[2] - q[0], q[3] - q[1]), dark = new Path2D();
        dark.rect(r[0], r[1], r[2], r[3]); dark.addPath(sp);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.fill(dark, 'evenodd');     // what will be cut away
        ctx.font = '600 12px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const cx = (q[0] + q[2]) / 2, cy = (q[1] + q[3]) / 2;
        ctx.globalAlpha = 0.9; ctx.fillText('Cut to this shape', cx, cy);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(sp);
        ctx.restore();
        f.draw(ctx, false);
      },
      pointerDown: (p) => { const before = snap(); f.down(p); f._before = before; },
      pointerMove: (p) => { f.move(p); show(); View.request(); },
      pointerUp: () => { const before = f._before; f._before = null; f.up(); if (before) keep(before); show(); },
      pointerCancel: () => { f.cancel(); show(); },
      cancel: () => View.fit(),
      apply: () => {
        const r = f.rect();
        const cut = (pic, ox, oy) => {              // the shape filled with the picture
          const c = U.canvas(r.w, r.h), x = c.getContext('2d');
          x.fillStyle = '#000'; x.fill(Shapes.path(mem.shape, 0, 0, r.w, r.h));
          x.globalCompositeOperation = 'source-in';
          x.drawImage(pic, ox, oy);
          return c;
        };
        if (l.base) {
          // the background photo: the canvas is cut to the frame, then the photo to the shape
          Doc.transform([{ t: 'translate', dx: -r.x, dy: -r.y }], r.w, r.h);
          l.bitmap = cut(l.bitmap, 0, 0);
        } else replace(l, cut(bm, -r.x, -r.y), r.x + r.w / 2, r.y + r.h / 2);
        History.commit();
        View.fit();
      }
    };
    View.fit(); fitShape(); show();
    UI.enterMode(m);
  };

  /* ============================ CUTOUT / REMOVE BG / ERASER ============================ */
  /* which pixels can be reached from the seeds through pixels that pass ok(i) -> Uint8Array (1 = reached) */
  function flood(W, H, seeds, ok) {
    const N = W * H, out = new Uint8Array(N), stack = new Int32Array(N);
    let n = 0;
    for (const s of seeds) if (!out[s] && ok(s)) { out[s] = 1; stack[n++] = s; }
    const last = N - W;
    while (n) {
      const i = stack[--n], x = i % W;
      if (x > 0 && !out[i - 1] && ok(i - 1)) { out[i - 1] = 1; stack[n++] = i - 1; }
      if (x < W - 1 && !out[i + 1] && ok(i + 1)) { out[i + 1] = 1; stack[n++] = i + 1; }
      if (i >= W && !out[i - W] && ok(i - W)) { out[i - W] = 1; stack[n++] = i - W; }
      if (i < last && !out[i + W] && ok(i + W)) { out[i + W] = 1; stack[n++] = i + W; }
    }
    return out;
  }
  Cutout._flood = flood;

  /* start: 'auto' (remove the background at once) | 'around' (draw around the part to keep) | 'erase' */
  Cutout.open = function (t, start) {
    const l = target(t);
    if (!l) return;
    const src = l.bitmap, W = src.width, H = src.height, N = W * H, b = bench(W, H), mem = Cutout.mem;
    const data = IP.read(src).data;                             // the colours of the picture (never changed)
    const mask = U.canvas(W, H), mx = mask.getContext('2d');    // what is kept (its alpha)
    const comp = U.canvas(W, H), cx = comp.getContext('2d');    // picture × mask, what the user sees
    let A = new Uint8Array(N).fill(255);                        // the same as numbers. Never changed in place: every step makes a new one
    const undo = [], redo = [];
    let tool = null, dirty = true, live = null, loop = null, lastOp = '', finger = null, hintUntil = 0;
    const aiKey = 'cut' + U.uid();                              // the AI keeps its answers for this picture under this name
    let aiRun = 0, aiPick = '', closed = false;
    const way = () => (AICut.ready() ? mem.ai : 'plain');       // 'auto' | 'person' | 'object' (AI) or 'plain' (colour)

    const putMask = () => {
      const im = mx.createImageData(W, H), d = im.data;
      for (let i = 0, j = 3; i < N; i++, j += 4) d[j] = A[i];
      mx.putImageData(im, 0, 0); dirty = true;
    };
    const readMask = () => {
      const d = mx.getImageData(0, 0, W, H).data, a = new Uint8Array(N);
      for (let i = 0, j = 3; i < N; i++, j += 4) a[i] = d[j];
      A = a;
    };
    const step = (op) => { undo.push(A); if (undo.length > 12) undo.shift(); redo.length = 0; lastOp = op; };      // call before A is replaced
    const compose = () => {
      if (!dirty) return;
      dirty = false;
      cx.globalCompositeOperation = 'copy'; cx.drawImage(src, 0, 0);
      cx.globalCompositeOperation = 'destination-in'; cx.drawImage(mask, 0, 0);
      cx.globalCompositeOperation = 'source-over';
    };
    const kept = () => { let n = 0; for (let i = 0; i < N; i += 7) if (A[i] > 127 && data[i * 4 + 3] > 127) n++; return n * 7 / N; };      // share of the picture still there
    const tol2 = () => { const d = mem.tol * 2.1 + 6; return d * d; };
    const refresh = () => { UI.refreshTop(); View.request(); };

    /* take the reached pixels out (or bring them back) with a slightly soft edge */
    function carve(hit, bring, op) {
      let n = 0;
      for (let i = 0; i < N; i++) n += hit[i];
      if (!n) return false;
      const f = new Float32Array(N);
      for (let i = 0; i < N; i++) f[i] = hit[i];
      IP.blurPlane(f, W, H, 0.9);
      const a = new Uint8Array(N);
      if (bring) for (let i = 0; i < N; i++) { const v = U.clamp((f[i] - 0.3) * 2.5, 0, 1); a[i] = Math.max(A[i], Math.round(255 * v)); }
      else for (let i = 0; i < N; i++) { const v = U.clamp((f[i] - 0.12) * 2.6, 0, 1); a[i] = Math.min(A[i], Math.round(255 * (1 - v))); }      // bites about one pixel into the edge: no rim of background stays
      step(op); A = a; putMask();
      return true;
    }
    /* Auto: the colours along the edge of the picture are "background"; remove them as far as they are connected to the edge */
    function auto() {
      if (lastOp === 'auto' && undo.length) { A = undo.pop(); lastOp = ''; }      // pressed again (other tolerance): start from before
      const bins = new Map();
      let total = 0, clear = 0;
      const sample = (i) => {
        const j = i * 4;
        if (data[j + 3] < 128) { clear++; return; }
        const key = (data[j] >> 4) << 8 | (data[j + 1] >> 4) << 4 | (data[j + 2] >> 4);
        let q = bins.get(key);
        if (!q) { q = [0, 0, 0, 0]; bins.set(key, q); }
        q[0]++; q[1] += data[j]; q[2] += data[j + 1]; q[3] += data[j + 2]; total++;
      };
      const sx = Math.max(1, Math.floor(W / 500)), sy = Math.max(1, Math.floor(H / 500));
      for (let x = 0; x < W; x += sx) { sample(x); sample((H - 1) * W + x); }
      for (let y = 0; y < H; y += sy) { sample(y * W); sample(y * W + W - 1); }
      if (!total) { putMask(); return clear ? 'clear' : 'none'; }
      const cols = [];
      let cover = 0;
      for (const q of Array.from(bins.values()).sort((p, r) => r[0] - p[0])) {
        if (cols.length >= 8 || cover > total * 0.92) break;
        cols.push([q[1] / q[0], q[2] / q[0], q[3] / q[0]]); cover += q[0];
      }
      const lut = new Uint8Array(32768), t2 = tol2();           // which of 32 × 32 × 32 colours count as background
      for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let bl = 0; bl < 32; bl++) {
        const R = r * 8 + 4, G = g * 8 + 4, B = bl * 8 + 4;
        for (const c of cols) { const dr = R - c[0], dg = G - c[1], db = B - c[2]; if (dr * dr + dg * dg + db * db <= t2) { lut[r << 10 | g << 5 | bl] = 1; break; } }
      }
      const ok = (i) => { const j = i * 4; return data[j + 3] < 128 || lut[(data[j] >> 3) << 10 | (data[j + 1] >> 3) << 5 | (data[j + 2] >> 3)] === 1; };
      const seeds = [];
      for (let x = 0; x < W; x++) seeds.push(x, (H - 1) * W + x);
      for (let y = 0; y < H; y++) seeds.push(y * W, y * W + W - 1);
      if (!carve(flood(W, H, seeds, ok), false, 'auto')) { putMask(); return 'none'; }
      return 'ok';
    }
    async function runPlain() {
      let res = 'none';
      await U.busy(() => { res = auto(); }, 'Removing the background…');
      const left = kept();
      if (res === 'clear') U.toast('The edge of this picture is already see-through. Use “Tap colour” or “Erase”.', 3600);
      else if (res === 'none') U.toast('Nothing was removed. Raise Tolerance, or tap the background with “Tap colour”.', 3600);
      else if (left < 0.02) U.toast('Almost everything was removed — lower Tolerance, or press Undo.', 3600);
      refresh();
    }
    /* AI: the models find the person or thing; the answer is one more step on the mask (Undo takes it back) */
    async function runAI(mode) {
      const my = ++aiRun;
      if (await AICut.mustDownload()) {
        // on the web the AI comes over the network once; that is the user's data volume, so ask first
        const yes = await UI.confirm('Download the AI?', 'It is about ' + AICut.megabytes() + ' MB, downloaded once and then kept on this phone. Your pictures are not sent anywhere.', 'Download', 'Not now');
        if (closed || my !== aiRun) return;
        if (!yes) { mem.ai = 'plain'; if (tool === 'auto') UI.setPanel(panelFor('auto')); return runPlain(); }
        AICut.agree();
      }
      let res = null, err = null;
      await U.busy(async () => {
        try { res = await AICut.cut({ canvas: src, data: data, key: aiKey, mode: mode }, (t) => U.busyLabel(t)); }
        catch (e) { err = e; }
      }, 'Getting the AI ready…');
      if (closed || my !== aiRun) return;
      if (err || !res || !res.alpha || res.alpha.length !== N) {
        console.warn('AI cut-out failed:', err && err.message);
        U.toast('The AI could not run on this phone just now. The colour method is used instead.', 4200);
        mem.ai = 'plain';
        if (tool === 'auto') UI.setPanel(panelFor('auto'));
        return runPlain();
      }
      if (lastOp === 'auto' && undo.length) { A = undo.pop(); lastOp = ''; }      // pressed again (other way): start from before
      const al = res.alpha, a = new Uint8Array(N);
      for (let i = 0; i < N; i++) a[i] = A[i] < al[i] ? A[i] : al[i];
      step('auto'); A = a; putMask();
      aiPick = res.pick;
      const left = kept();
      if (left < 0.004) U.toast('The AI found nothing to keep here. Try “Person” or “Object”, or “Draw around”.', 4200);
      else if (mode === 'auto') U.toast(aiPick === 'person' ? 'Cut out as a person. Not right? Try “Object”.' : 'Cut out as an object. Not right? Try “Person”.', 2600);
      if (tool === 'auto') UI.setPanel(panelFor('auto'));
      refresh();
    }
    const runAuto = () => (way() === 'plain' ? runPlain() : runAI(way()));
    /* Tap colour: remove (or bring back) the patch of similar colour under the finger */
    function tapAt(p) {
      const q = b.toBmp(p), x = Math.floor(q[0]), y = Math.floor(q[1]);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = (Y * W + X) * 4;
        if (data[j + 3] < 128) continue;
        r += data[j]; g += data[j + 1]; bl += data[j + 2]; n++;
      }
      if (!n) { U.toast('There is nothing at this place'); return; }
      r /= n; g /= n; bl /= n;
      const t2 = tol2();
      const ok = (i) => { const j = i * 4; if (data[j + 3] < 128) return false; const dr = data[j] - r, dg = data[j + 1] - g, db = data[j + 2] - bl; return dr * dr + dg * dg + db * db <= t2; };
      const hit = flood(W, H, [y * W + x], ok);
      hit[y * W + x] = 1;
      if (!carve(hit, mem.bring, 'tap')) U.toast('Nothing changed');
      refresh();
    }
    /* one piece of a brush stroke on the mask */
    const radius = () => Math.max(1.5, mem.size / 2 / b.px());      // the brush keeps its size on screen: zoom in for fine work
    function dab(x0, y0, x1, y1, r, bring) {
      const soft = mem.soft / 100 * r * 1.2;
      mx.save();
      mx.globalCompositeOperation = bring ? 'source-over' : 'destination-out';
      mx.lineCap = 'round'; mx.lineJoin = 'round'; mx.strokeStyle = '#000'; mx.lineWidth = Math.max(1, 2 * r - soft);
      if (soft > 0.5) {
        // soft edge: the line itself is drawn outside the picture, only its blurred shadow lands on it
        const OFF = W + H + 4 * r + 100;
        mx.shadowColor = '#000'; mx.shadowBlur = soft; mx.shadowOffsetX = OFF; mx.translate(-OFF, 0);
      }
      mx.beginPath(); mx.moveTo(x0, y0); mx.lineTo(x1 + 0.01, y1 + 0.01); mx.stroke();
      mx.restore();
      dirty = true;
    }
    function invert() {
      const a = new Uint8Array(N);
      for (let i = 0; i < N; i++) a[i] = 255 - A[i];
      step('invert'); A = a; putMask(); refresh();
    }
    function resetAll() {
      if (!undo.length && lastOp === '') return;
      step('reset'); A = new Uint8Array(N).fill(255); putMask(); refresh();
    }

    /* ---- panels ---- */
    const note = (t) => h('p', { class: 'panel-note', text: t });
    const tolSlider = (onChange) => UI.slider({ label: 'Tolerance', min: 1, max: 100, value: mem.tol, onInput: (v) => { mem.tol = v; }, onChange: onChange });
    const showBrush = () => { hintUntil = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    const brushPanel = (text) => h('div', { class: 'panel-pad' },
      UI.slider({ label: 'Size', min: 6, max: 160, value: mem.size, onInput: (v) => { mem.size = v; showBrush(); } }),
      UI.slider({ label: 'Soft edge', min: 0, max: 100, value: mem.soft, onInput: (v) => { mem.soft = v; } }),
      note(text));
    function panelFor(id) {
      if (id === 'auto') {
        const go = h('button', { class: 'btn pri', type: 'button', id: 'cut-auto', text: 'Remove background' });
        U.onTap(go, runAuto);
        const plainNote = 'Works on a plain background (wall, sky, one colour). Then tidy up with Erase and Restore.';
        if (!AICut.ready()) {
          return h('div', { class: 'panel-pad' }, tolSlider(() => { if (lastOp === 'auto') runAuto(); }), h('div', { class: 'row-c' }, go),
            note(plainNote + (AICut.possible() ? '' : ' (The AI way needs the Android app or the web address; it cannot start from a file opened directly.)')));
        }
        // with the AI add-on: choose the way; a tap on a chip does it at once
        const ways = UI.chips([['auto', 'AI'], ['person', 'Person'], ['object', 'Object'], ['plain', 'Colour']], mem.ai, (v) => { mem.ai = v; UI.setPanel(panelFor('auto')); runAuto(); });
        ways.id = 'cut-ways';
        const text = mem.ai === 'plain' ? plainNote
          : mem.ai === 'auto' ? 'The AI finds the person or thing by itself' + (aiPick ? ' (this time: ' + aiPick + ')' : '') + '. Then tidy up with Erase and Restore.'
            : mem.ai === 'person' ? 'For people: keeps fine hair. Then tidy up with Erase and Restore.'
              : 'For things, animals, food, cars. Then tidy up with Erase and Restore.';
        return h('div', { class: 'panel-pad' }, ways, mem.ai === 'plain' ? tolSlider(() => { if (lastOp === 'auto') runAuto(); }) : null, h('div', { class: 'row-c' }, go), note(text));
      }
      if (id === 'tap') {
        return h('div', { class: 'panel-pad' }, tolSlider(null),
          UI.chips([['rem', 'Remove'], ['bring', 'Bring back']], mem.bring ? 'bring' : 'rem', (v) => { mem.bring = v === 'bring'; }),
          note('Tap a colour in the picture: the whole patch of that colour goes.'));
      }
      if (id === 'erase') return brushPanel('Rub with one finger. Two fingers zoom and move the picture.');
      if (id === 'restore') return brushPanel('Rub to bring back what was removed (shown faintly).');
      return h('div', { class: 'panel-pad' },
        UI.chips([['keep', 'Keep the inside'], ['remove', 'Remove the inside']], mem.inside, (v) => { mem.inside = v; }),
        note('Draw a line around the part with one finger.'));
    }
    function pick(id) { tool = id; UI.markActive(id); UI.setPanel(panelFor(id)); View.request(); }

    const m = {
      title: 'Cutout',
      items: [
        { id: 'auto', icon: 'wand', label: 'Auto', onTap: () => pick('auto') },
        { id: 'tap', icon: 'dropper', label: 'Tap colour', onTap: () => pick('tap') },
        { id: 'erase', icon: 'eraser', label: 'Erase', onTap: () => pick('erase') },
        { id: 'restore', icon: 'restore', label: 'Restore', onTap: () => pick('restore') },
        { id: 'around', icon: 'lasso', label: 'Draw around', onTap: () => pick('around') },
        { sep: true },
        { id: 'invert', icon: 'invert', label: 'Invert', onTap: invert },
        { id: 'resetcut', icon: 'reset', label: 'Reset', onTap: resetAll }
      ],
      history: {
        canUndo: () => undo.length > 0, canRedo: () => redo.length > 0,
        undo: () => { if (undo.length) { redo.push(A); A = undo.pop(); lastOp = ''; putMask(); View.request(); } },
        redo: () => { if (redo.length) { undo.push(A); A = redo.pop(); lastOp = ''; putMask(); View.request(); } }
      },
      render: (ctx, v) => {
        compose();
        b.draw(ctx, v, [tool === 'restore' ? { c: src, alpha: 0.3 } : null, comp]);
        ctx.save();
        if (loop && loop.length > 2) {
          ctx.beginPath();
          for (let i = 0; i < loop.length; i += 2) { const q = b.toView(loop[i], loop[i + 1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
          ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.setLineDash([7, 5]); ctx.stroke();
        }
        const brush = tool === 'erase' || tool === 'restore';
        if (brush && (finger || Date.now() < hintUntil)) {
          const c = finger || [v.w / 2, v.h / 2];
          ctx.setLineDash([]); ctx.beginPath(); ctx.arc(c[0], c[1], mem.size / 2, 0, 6.2832);
          ctx.fillStyle = tool === 'erase' ? 'rgba(255,60,90,.22)' : 'rgba(80,220,120,.22)'; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
        ctx.restore();
      },
      pointerDown: (p) => {
        finger = p;
        const q = b.toBmp(p);
        if (tool === 'erase' || tool === 'restore') {
          step(tool);
          live = { x: q[0], y: q[1], r: radius(), bring: tool === 'restore', last: p };
          dab(q[0], q[1], q[0], q[1], live.r, live.bring);
        } else if (tool === 'around') loop = [q[0], q[1]];
        else live = { tap: p };
        View.request();
      },
      pointerMove: (p) => {
        finger = p;
        if (live && live.tap) { if (Math.hypot(p[0] - live.tap[0], p[1] - live.tap[1]) > 12) live = null; return; }
        if (live) {
          if (Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 1.5) return;
          const q = b.toBmp(p);
          dab(live.x, live.y, q[0], q[1], live.r, live.bring);
          live.x = q[0]; live.y = q[1]; live.last = p;
        } else if (loop) { const q = b.toBmp(p); loop.push(q[0], q[1]); }
        View.request();
      },
      pointerUp: (p) => {
        finger = null;
        if (live && live.tap) { const at = live.tap; live = null; if (tool === 'tap') tapAt(at); else if (tool === 'auto') U.toast('Press “Remove background”, or choose another tool below'); return; }
        if (live) { live = null; readMask(); refresh(); return; }
        if (loop) {
          const pts = loop; loop = null;
          if (pts.length >= 12) {
            const path = new Path2D();
            path.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
            path.closePath();
            step('around');
            mx.save(); mx.globalCompositeOperation = mem.inside === 'keep' ? 'destination-in' : 'destination-out'; mx.fillStyle = '#000'; mx.fill(path); mx.restore();
            dirty = true; readMask();
          }
          refresh();
        }
      },
      pointerCancel: () => {
        finger = null; loop = null;
        if (live && !live.tap) { A = undo.pop() || A; putMask(); }      // a second finger came down: that was a zoom, not a stroke
        live = null; refresh();
      },
      cancel: () => { closed = true; View.fit(); },
      apply: async () => {
        closed = true;
        View.fit();
        if (!undo.length) return;
        let same = true;
        for (let i = 0; i < N; i++) if (A[i] !== 255) { same = false; break; }
        if (same) return;
        let empty = false;
        await U.busy(() => {
          dirty = true; compose();
          if (l.base) { if (kept() <= 0) { empty = true; return; } l.bitmap = U.cloneCanvas(comp); delete l.shape; }
          else {
            const t2 = U.trimCanvas(comp, 1);
            if (!t2) { empty = true; return; }
            replace(l, t2.canvas, t2.x + t2.canvas.width / 2, t2.y + t2.canvas.height / 2);
          }
          History.commit();
        }, 'Applying…');
        if (empty) U.toast('Nothing would be left of the picture, so it was not changed', 3400);
      }
    };
    putMask();
    View.fit();
    UI.enterMode(m);
    pick(start === 'around' || start === 'erase' ? start : 'auto');
    if (start !== 'around' && start !== 'erase') runAuto();
  };
})();
