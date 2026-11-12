'use strict';
/* ============================================================
 * 19-decor.js : things laid around or over the picture
 *   FitTool       - another canvas shape with the picture fitted in (blurred / coloured background)
 *   BorderTool    - a border around or inside the picture
 *   FrameTool     - drawn frames (polaroid, film, stamp …)
 *   ShapeMaskTool - a coloured sheet with a shape-shaped window
 *   MaskTool      - light leaks, bokeh, snow, rain … as an overlay
 *   FlareTool     - lens flares
 *   CalloutTool   - speech bubbles (a text with a bubble behind it)
 * Everything here is drawn by the app itself, no picture files.
 * ============================================================ */
const FitTool = {};
const BorderTool = {};
const FrameTool = {};
const ShapeMaskTool = {};
const MaskTool = {};
const FlareTool = {};
const CalloutTool = {};
(function () {
  const h = U.h;
  const pad = (...kids) => h('div', { class: 'panel-pad' }, kids);
  const sub = (t) => h('div', { class: 'sub-h pl', text: t });
  /* a rounded rectangle added to a path */
  function rr(p, X, Y, W, H, r) {
    r = Math.max(0, Math.min(r, W / 2, H / 2));
    p.moveTo(X + r, Y); p.arcTo(X + W, Y, X + W, Y + H, r); p.arcTo(X + W, Y + H, X, Y + H, r); p.arcTo(X, Y + H, X, Y, r); p.arcTo(X, Y, X + W, Y, r); p.closePath();
  }
  /* put a picture over the whole canvas as a new top layer (it may be smaller than the canvas: it is stretched) */
  function addTop(c, name, props) {
    const l = Layers.image(c, Object.assign({ name: name, x: Doc.width / 2, y: Doc.height / 2 }, props || {}));
    l.scaleX = Doc.width / c.width; l.scaleY = Doc.height / c.height;
    Doc.add(l); Doc.selectedId = l.id;
    return l;
  }
  /* size for a picture that covers the canvas: the canvas itself, but not more than `max` on the long side */
  function coverSize(max) {
    const k = Math.min(1, (max || 1600) / Math.max(Doc.width, Doc.height));
    return [Math.max(1, Math.round(Doc.width * k)), Math.max(1, Math.round(Doc.height * k))];
  }
  /* a strip of small previews to choose from. items: [{id, name}], paint(canvas, item) */
  function strip(items, value, paint, onPick) {
    const el = h('div', { class: 'fx-strip' });
    for (const it of items) {
      const cv = h('canvas', { width: 124, height: 124 });
      paint(cv, it);
      const b = h('button', { class: 'fx-it' + (it.id === value ? ' on' : ''), type: 'button', 'data-id': it.id }, cv, h('span', { text: it.name }));
      U.onTap(b, () => { for (const c of el.children) c.classList.toggle('on', c === b); onPick(it); });
      el.appendChild(b);
    }
    return el;
  }
  const tile = (x, S) => { const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#5b6b8c'); g.addColorStop(1, '#2a2f45'); x.fillStyle = g; x.fillRect(0, 0, S, S); };

  /* ============================ FIT ============================ */
  FitTool.mem = { ratio: '1:1', bg: 'blur', color: '#ffffff', size: 100, pick: false };
  FitTool.open = function () {
    const mem = FitTool.mem, W = Doc.width, H = Doc.height;
    const small = Doc.flatten({ maxDim: 220, fill: Doc.bg.type === 'color' ? Doc.bg.color : null });
    const soft = IP.write(IP.blur(IP.read(small), 7));
    /* the new canvas: [newW, newH, k] where k scales the present picture (only when the canvas would get too big) */
    function plan() {
      const q = mem.ratio.split(':'), a = +q[0] / +q[1], s = mem.size / 100;
      let nw = Math.max(W, H * a) / s, nh = nw / a;
      const k = Math.min(1, Math.sqrt(MAX_PIX / (nw * nh)));     // only a huge canvas is made smaller
      nw = Math.max(1, Math.round(nw * k)); nh = Math.max(1, Math.round(nh * k));
      return [nw, nh, k];
    }
    function drawBg(ctx, nw, nh, pic) {
      if (mem.bg === 'color') { ctx.fillStyle = mem.color; ctx.fillRect(0, 0, nw, nh); return; }
      if (mem.bg !== 'blur') return;
      const sc = Math.max(nw / pic.width, nh / pic.height) * 1.08, dw = pic.width * sc, dh = pic.height * sc;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, nw, nh); ctx.clip();
      ctx.fillStyle = '#15151a'; ctx.fillRect(0, 0, nw, nh);                    // nothing see-through is left, also where the picture was
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(pic, (nw - dw) / 2, (nh - dh) / 2, dw, dh);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, nw, nh);
      ctx.restore();
    }
    const palette = h('div', { class: mem.bg === 'color' ? '' : 'hidden' }, UI.palette({ value: mem.color, onPick: (c) => { mem.color = c; View.request(); } }));
    const m = {
      title: 'Fit',
      panel: pad(
        UI.chips([['1:1', '1:1'], ['4:5', '4:5'], ['3:4', '3:4'], ['9:16', '9:16'], ['16:9', '16:9'], ['4:3', '4:3'], ['5:4', '5:4'], ['2:3', '2:3'], ['3:2', '3:2']], mem.ratio, (v) => { mem.ratio = v; View.request(); }),
        UI.slider({ label: 'Size', min: 40, max: 100, value: mem.size, onInput: (v) => { mem.size = v; View.request(); } }),
        UI.chips([['blur', 'Blurred photo'], ['color', 'Colour'], ['pick', 'Tap a colour'], ['none', 'See-through']], mem.bg, (v) => {
          mem.bg = v === 'pick' ? 'color' : v;
          mem.pick = v === 'pick';
          palette.classList.toggle('hidden', mem.bg !== 'color');
          if (mem.pick) U.toast('Tap a colour in the photo'); else View.request();
        }),
        palette,
        h('p', { class: 'panel-note', text: 'Tap a colour: the empty part around the photo is filled with the colour you tap.' })),
      pointerDown: (p) => {
        if (!mem.pick) return;
        // the colour under the finger, from a small copy of the picture
        const d = View.toDoc(p[0], p[1]);
        const c = Doc.flatten({ maxDim: 400, fill: '#808080' }), x = c.getContext('2d');
        const kx = c.width / Doc.width, ky = c.height / Doc.height;
        const px = Math.max(0, Math.min(c.width - 1, Math.round(d[0] * kx))), py = Math.max(0, Math.min(c.height - 1, Math.round(d[1] * ky)));
        const q = x.getImageData(px, py, 1, 1).data;
        const hex = '#' + [q[0], q[1], q[2]].map((n) => n.toString(16).padStart(2, '0')).join('');
        mem.color = hex; mem.bg = 'color'; mem.pick = false;
        UI.refreshTop();
        View.request();
        U.toast('Background colour: ' + hex, 1400);
      },
      render: (ctx, v) => {
        const p = plan(), nw = p[0], nh = p[1], k = p[2];
        const q = Math.min((v.w - 28) / nw, (v.h - 28) / nh), X = (v.w - nw * q) / 2, Y = (v.h - nh * q) / 2;
        ctx.save();
        ctx.fillStyle = v.checker(ctx); ctx.fillRect(X, Y, nw * q, nh * q);
        ctx.translate(X, Y); ctx.scale(q, q);
        drawBg(ctx, nw, nh, soft);
        ctx.translate((nw - W * k) / 2, (nh - H * k) / 2); ctx.scale(k, k);
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        Doc.composite(ctx);
        ctx.restore();
      },
      apply: async () => {
        const p = plan(), nw = p[0], nh = p[1], k = p[2];
        if (nw === W && nh === H && mem.bg === 'none') return;
        await U.busy(() => {
          let back = null;
          if (mem.bg === 'blur') {
            const mid = Doc.flatten({ maxDim: 420, fill: Doc.bg.type === 'color' ? Doc.bg.color : null });
            const blurred = IP.write(IP.blur(IP.read(mid), 13));
            back = U.canvas(nw, nh);
            drawBg(back.getContext('2d'), nw, nh, blurred);
          }
          // the old background photo becomes an ordinary photo that can be moved; an old canvas colour becomes a layer
          for (const l of Doc.layers) if (l.base) { l.base = false; l.locked = false; l.name = 'Photo'; }
          if (Doc.bg.type === 'color') {
            const c = U.canvas(Math.min(W, 64), Math.min(H, 64)), x = c.getContext('2d');
            x.fillStyle = Doc.bg.color; x.fillRect(0, 0, c.width, c.height);
            const paper = Layers.image(c, { name: 'Canvas colour', x: W / 2, y: H / 2 });
            paper.scaleX = W / c.width; paper.scaleY = H / c.height;
            Doc.layers.unshift(paper);
          }
          const ops = [];
          if (k < 1) ops.push({ t: 'scale', k: k });
          ops.push({ t: 'translate', dx: (nw - W * k) / 2, dy: (nh - H * k) / 2 });
          Doc.transform(ops, nw, nh);
          Doc.bg = mem.bg === 'color' ? { type: 'color', color: mem.color } : { type: 'none', color: '#ffffff' };
          if (back) Doc.layers.unshift(Layers.image(back, { name: 'Background', x: nw / 2, y: nh / 2, locked: true, base: true }));
          Doc.selectedId = null;
          History.commit();
        }, 'Applying…');
        View.fit();
      }
    };
    Doc.select(null);
    UI.enterMode(m);
  };

  /* ============================ BORDER ============================ */
  BorderTool.mem = { color: '#ffffff', width: 5, round: 0, where: 'out' };
  BorderTool.open = function () {
    const mem = BorderTool.mem, W = Doc.width, H = Doc.height, unit = Math.min(W, H) / 100;
    const geo = () => {
      const b = mem.width * unit, out = mem.where === 'out';
      return { b: b, out: out, nw: out ? W + 2 * b : W, nh: out ? H + 2 * b : H, r: mem.round / 100 * Math.min(W, H) / 2 * (out ? 1 : 0.9) };
    };
    function ringPath(nw, nh, b, r) { const p = new Path2D(); p.rect(0, 0, nw, nh); rr(p, b, b, nw - 2 * b, nh - 2 * b, r); return p; }
    const m = {
      title: 'Border',
      panel: pad(
        UI.chips([['out', 'Around the picture'], ['in', 'Inside the picture']], mem.where, (v) => { mem.where = v; View.request(); }),
        UI.palette({ value: mem.color, onPick: (c) => { mem.color = c; View.request(); } }),
        UI.slider({ label: 'Width', min: 1, max: 25, value: mem.width, onInput: (v) => { mem.width = v; View.request(); } }),
        UI.slider({ label: 'Round', min: 0, max: 100, value: mem.round, onInput: (v) => { mem.round = v; View.request(); } })),
      render: (ctx, v) => {
        const g = geo(), q = Math.min((v.w - 28) / g.nw, (v.h - 28) / g.nh), X = (v.w - g.nw * q) / 2, Y = (v.h - g.nh * q) / 2, o = g.out ? g.b : 0;
        ctx.save();
        ctx.fillStyle = v.checker(ctx); ctx.fillRect(X, Y, g.nw * q, g.nh * q);
        ctx.translate(X, Y); ctx.scale(q, q);
        ctx.save(); ctx.translate(o, o); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); Doc.composite(ctx); ctx.restore();
        ctx.fillStyle = mem.color; ctx.fill(ringPath(g.nw, g.nh, g.b, g.r), 'evenodd');
        ctx.restore();
      },
      apply: () => {
        const g = geo();
        let k = 1;
        if (g.out) {
          k = Math.min(1, Math.sqrt(MAX_PIX / (g.nw * g.nh)));   // only a huge canvas is made smaller
          const ops = [{ t: 'translate', dx: g.b, dy: g.b }];
          if (k < 1) ops.push({ t: 'scale', k: k });
          Doc.transform(ops, g.nw * k, g.nh * k);
        }
        const c = U.canvas(Doc.width, Doc.height), x = c.getContext('2d');
        x.fillStyle = mem.color; x.fill(ringPath(c.width, c.height, g.b * k, g.r * k), 'evenodd');
        addTop(c, 'Border');
        History.commit();
        View.fit();
      }
    };
    Doc.select(null);
    UI.enterMode(m);
  };

  /* ============================ FRAME ============================ */
  /* every frame draws itself: (x, W, H, t = thickness in px, colour) */
  const FRAMES = [
    { id: 'simple', name: 'Simple', draw: (x, W, H, t) => { const p = new Path2D(); p.rect(0, 0, W, H); p.rect(t, t, W - 2 * t, H - 2 * t); x.fill(p, 'evenodd'); } },
    { id: 'round', name: 'Rounded', draw: (x, W, H, t) => { const p = new Path2D(); p.rect(0, 0, W, H); rr(p, t, t, W - 2 * t, H - 2 * t, t * 2.4); x.fill(p, 'evenodd'); } },
    { id: 'polaroid', name: 'Polaroid', draw: (x, W, H, t) => { const p = new Path2D(); p.rect(0, 0, W, H); p.rect(t, t, W - 2 * t, H - t - t * 3.6); x.fill(p, 'evenodd'); } },
    { id: 'double', name: 'Double', draw: (x, W, H, t) => { x.lineWidth = t * 0.42; x.strokeRect(t * 0.45, t * 0.45, W - t * 0.9, H - t * 0.9); x.lineWidth = t * 0.16; x.strokeRect(t * 1.05, t * 1.05, W - t * 2.1, H - t * 2.1); } },
    { id: 'line', name: 'Thin line', draw: (x, W, H, t) => { x.lineWidth = Math.max(1, t * 0.18); x.strokeRect(t, t, W - 2 * t, H - 2 * t); } },
    { id: 'corners', name: 'Corners', draw: (x, W, H, t) => {
      const L = Math.min(W, H) * 0.16 + t, o = t * 0.7; x.lineWidth = t * 0.5; x.lineCap = 'square'; x.beginPath();
      for (const c of [[o, o, 1, 1], [W - o, o, -1, 1], [W - o, H - o, -1, -1], [o, H - o, 1, -1]]) { x.moveTo(c[0] + c[2] * L, c[1]); x.lineTo(c[0], c[1]); x.lineTo(c[0], c[1] + c[3] * L); }
      x.stroke();
    } },
    { id: 'stitch', name: 'Stitched', draw: (x, W, H, t) => { const p = new Path2D(); p.rect(0, 0, W, H); rr(p, t * 1.5, t * 1.5, W - 3 * t, H - 3 * t, t); x.fill(p, 'evenodd'); x.save(); x.globalCompositeOperation = 'destination-out'; x.lineWidth = Math.max(1, t * 0.14); x.setLineDash([t * 0.6, t * 0.45]); x.strokeRect(t * 0.7, t * 0.7, W - t * 1.4, H - t * 1.4); x.restore(); } },
    { id: 'film', name: 'Film', draw: (x, W, H, t) => {
      const bar = t * 2.3, hw = bar * 0.42, hh = bar * 0.5, gap = hw * 1.9, n = Math.max(3, Math.floor(W / gap));
      x.fillRect(0, 0, W, bar); x.fillRect(0, H - bar, W, bar);
      x.save(); x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * W / n, p = new Path2D();
        rr(p, cx - hw / 2, (bar - hh) / 2, hw, hh, hw * 0.25); rr(p, cx - hw / 2, H - bar + (bar - hh) / 2, hw, hh, hw * 0.25);
        x.fill(p);
      }
      x.restore();
    } },
    { id: 'stamp', name: 'Stamp', draw: (x, W, H, t) => {
      const p = new Path2D(); p.rect(0, 0, W, H); p.rect(t * 1.5, t * 1.5, W - 3 * t, H - 3 * t); x.fill(p, 'evenodd');
      x.save(); x.globalCompositeOperation = 'destination-out';
      const r = t * 0.48, nx = Math.max(4, Math.round(W / (r * 3.2))), ny = Math.max(4, Math.round(H / (r * 3.2)));
      x.beginPath();
      for (let i = 0; i <= nx; i++) { const cx = i * W / nx; x.moveTo(cx + r, 0); x.arc(cx, 0, r, 0, 6.2832); x.moveTo(cx + r, H); x.arc(cx, H, r, 0, 6.2832); }
      for (let i = 1; i < ny; i++) { const cy = i * H / ny; x.moveTo(r, cy); x.arc(0, cy, r, 0, 6.2832); x.moveTo(W + r, cy); x.arc(W, cy, r, 0, 6.2832); }
      x.fill(); x.restore();
    } },
    { id: 'scallop', name: 'Scallop', draw: (x, W, H, t) => {
      const p = new Path2D(); p.rect(0, 0, W, H); p.rect(t, t, W - 2 * t, H - 2 * t); x.fill(p, 'evenodd');
      const r = t * 0.75, nx = Math.max(3, Math.round((W - 2 * t) / (r * 1.9))), ny = Math.max(3, Math.round((H - 2 * t) / (r * 1.9)));
      x.beginPath();
      for (let i = 0; i <= nx; i++) { const cx = t + i * (W - 2 * t) / nx; x.moveTo(cx + r, t); x.arc(cx, t, r, 0, 6.2832); x.moveTo(cx + r, H - t); x.arc(cx, H - t, r, 0, 6.2832); }
      for (let i = 0; i <= ny; i++) { const cy = t + i * (H - 2 * t) / ny; x.moveTo(t + r, cy); x.arc(t, cy, r, 0, 6.2832); x.moveTo(W - t + r, cy); x.arc(W - t, cy, r, 0, 6.2832); }
      x.fill();
    } },
    { id: 'oval', name: 'Oval', draw: (x, W, H, t) => { const p = new Path2D(); p.rect(0, 0, W, H); p.ellipse(W / 2, H / 2, Math.max(1, W / 2 - t * 0.6), Math.max(1, H / 2 - t * 0.6), 0, 0, 6.2832); x.fill(p, 'evenodd'); } },
    { id: 'arch', name: 'Arch', draw: (x, W, H, t) => { const p = new Path2D(), iw = W - 2 * t, r = iw / 2; p.rect(0, 0, W, H); p.moveTo(t, H - t); p.lineTo(t, t + r); p.arc(t + r, t + r, r, Math.PI, 0); p.lineTo(W - t, H - t); p.closePath(); x.fill(p, 'evenodd'); } }
  ];
  FrameTool.mem = { id: 'polaroid', color: '#ffffff', size: 5 };
  function paintFrame(c, id, color, size) {
    const x = c.getContext('2d'), f = FRAMES.find((q) => q.id === id) || FRAMES[0];
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = color; x.strokeStyle = color;
    f.draw(x, c.width, c.height, Math.max(1, size / 100 * Math.min(c.width, c.height)), color);
    return c;
  }
  FrameTool.open = function () {
    const mem = FrameTool.mem, sz = coverSize(1280);
    const pv = U.canvas(sz[0], sz[1]);
    const update = () => { paintFrame(pv, mem.id, mem.color, mem.size); View.request(); };
    const m = {
      title: 'Frame',
      panel: pad(
        strip(FRAMES, mem.id, (cv, it) => { const x = cv.getContext('2d'); tile(x, 124); const t = U.canvas(124, 124); paintFrame(t, it.id, '#ffffff', 7); x.drawImage(t, 0, 0); }, (it) => { mem.id = it.id; update(); }),
        UI.palette({ value: mem.color, onPick: (c) => { mem.color = c; update(); } }),
        UI.slider({ label: 'Size', min: 1, max: 15, value: mem.size, onInput: (v) => { mem.size = v; update(); } })),
      drawDoc: (ctx) => { ctx.drawImage(pv, 0, 0, Doc.width, Doc.height); },
      apply: () => {
        const c = U.canvas(Doc.width, Doc.height);
        paintFrame(c, mem.id, mem.color, mem.size);
        addTop(c, 'Frame');
        History.commit();
      }
    };
    Doc.select(null);
    update();
    UI.enterMode(m);
  };

  /* ============================ SHAPE MASK ============================ */
  ShapeMaskTool.mem = { shape: 'circle', color: '#ffffff', opacity: 100, size: 80, way: 'shape', tol: 30, tapOnce: false, sheet: null, toneAt: null };
  ShapeMaskTool.open = function () {
    const mem = ShapeMaskTool.mem, W = Doc.width, H = Doc.height;
    let cx = W / 2, cy = H / 2, drag = null;
    let shape = mem.shape, size = mem.size, color = mem.color, op = mem.opacity;

    /* what is drawn over the picture: the coloured sheet with its window (shape) or the colours trimmed (tone) */
    function sheet(ctx, w, hh) {              // a canvas of w × hh that stands for the whole picture
      const k = w / W;
      if (mem.way === 'tone') { ctx.drawImage(mem.sheet, 0, 0, W, H, 0, 0, w, hh); return; }
      const a = Shapes.ratio(shape), side = size / 100 * Math.min(W, H);
      const sw = (a >= 1 ? side : side * a) * k, sh = (a >= 1 ? side / a : side) * k;
      const p = new Path2D();
      p.rect(0, 0, w, hh); p.addPath(Shapes.path(shape, cx * k - sw / 2, cy * k - sh / 2, sw, sh));
      ctx.fillStyle = color; ctx.fill(p, 'evenodd');
    }
    /* the second way: hide the colours nearest to the middle of the picture (or to the tapped spot) */
    function byTone(at) {
      const src = Doc.flatten({ maxDim: 1200 }), c = U.canvas(W, H), x = c.getContext('2d');
      const im = IP.read(src), d = im.data, sx = src.width / W, sy = src.height / H;
      const px = Math.max(0, Math.min(src.width - 1, Math.round(at[0] * sx))), py = Math.max(0, Math.min(src.height - 1, Math.round(at[1] * sy)));
      const j = (py * src.width + px) * 4, r0 = d[j], g0 = d[j + 1], b0 = d[j + 2];
      const tol = mem.tol * mem.tol * 2.2;
      const out = x.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const i = (Math.min(src.height - 1, Math.round(y * sy)) * src.width + Math.min(src.width - 1, Math.round(xx * sx))) * 4, o = (y * W + xx) * 4;
        const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0;
        if (dr * dr + dg * dg + db * db > tol) { out.data[o] = color.length === 7 ? parseInt(color.slice(1, 3), 16) : 0; out.data[o + 1] = color.length === 7 ? parseInt(color.slice(3, 5), 16) : 0; out.data[o + 2] = color.length === 7 ? parseInt(color.slice(5, 7), 16) : 0; out.data[o + 3] = 255; }
      }
      mem.sheet = IP.write(out);
      mem.toneAt = at;
      refreshPanel();
      View.request();
    }
    const m = {
      title: 'Shape Mask',
      pointerDown: (p) => {
        const d = View.toDoc(p[0], p[1]);
        if (mem.way === 'tone') { drag = { x: d[0], y: d[1], tap: true, cx: d[0], cy: d[1] }; return; }
        if (mem.tapOnce) { mem.tapOnce = false; cx = d[0]; cy = d[1]; View.request(); refreshPanel(); return; }      // "Tap to hide background"
        drag = { x: d[0], y: d[1], cx: cx, cy: cy };
      },
      pointerMove: (p) => {
        if (!drag || mem.way === 'tone') return;
        const d = View.toDoc(p[0], p[1]);
        if (drag.tap && Math.hypot(d[0] - drag.x, d[1] - drag.y) < 6) return;
        drag.tap = false;
        cx = U.clamp(drag.cx + d[0] - drag.x, 0, W); cy = U.clamp(drag.cy + d[1] - drag.y, 0, H); View.request();
      },
      pointerUp: (p) => {
        if (drag && mem.way === 'tone') { const d = View.toDoc(p[0], p[1]); drag = null; byTone([d[0], d[1]]); return; }
        drag = null;
      },
      pointerCancel: () => { if (drag && !drag.tap) { cx = drag.cx; cy = drag.cy; drag = null; View.request(); } drag = null; },
      drawDoc: (ctx) => {
        ctx.save(); ctx.globalAlpha = op / 100;
        if (mem.way === 'tone' && mem.sheet) ctx.drawImage(mem.sheet, 0, 0, W, H);
        else sheet(ctx, W, H);
        ctx.restore();
      },
      apply: () => {
        const c = U.canvas(W, H);
        sheet(c.getContext('2d'), W, H);
        addTop(c, mem.way === 'tone' ? 'Background hidden' : 'Shape mask', { opacity: op / 100 });
        History.commit();
      }
    };
    function panel() {
      const inner = [];
      inner.push(UI.chips([['shape', 'Shape'], ['tone', 'Tap to hide background']], mem.way === 'tone' ? 'tone' : 'shape', (v) => {
        mem.way = v;
        if (v === 'tone') { if (!mem.sheet) byTone([W / 2, H / 2]); }
        else mem.tapOnce = false;
        refreshPanel(); View.request();
      }));
      if (mem.way === 'tone') {
        inner.push(UI.slider({ label: 'How near the colour', min: 4, max: 90, value: mem.tol, onInput: (v) => { mem.tol = v; if (mem.toneAt) byTone(mem.toneAt); } }));
        inner.push(UI.palette({ value: color, onPick: (c) => { color = c; if (mem.toneAt) byTone(mem.toneAt); else { mem.sheet = null; refreshPanel(); } } }));
        inner.push(h('p', { class: 'panel-note', text: 'Tap the part of the picture that stays (a person, a thing). The rest is covered with the colour.' }));
      } else {
        inner.push(Shapes.strip(shape, (id) => { shape = id; mem.shape = id; View.request(); }));
        inner.push(UI.palette({ value: color, onPick: (c) => { color = c; mem.color = c; View.request(); } }));
        inner.push(UI.slider({ label: 'Size', min: 20, max: 140, value: size, onInput: (v) => { size = v; mem.size = v; View.request(); } }));
        const tap = h('button', { class: 'btn', type: 'button', id: 'sm-tap', text: mem.tapOnce ? 'Now tap the picture…' : 'Tap to hide background' });
        U.onTap(tap, () => { mem.tapOnce = !mem.tapOnce; refreshPanel(); });
        inner.push(h('div', { class: 'row-c' }, tap));
        inner.push(h('p', { class: 'panel-note', text: 'Drag on the picture to move the window, or tap it right on the spot you want to keep.' }));
      }
      inner.push(UI.slider({ label: 'Opacity', min: 10, max: 100, value: op, onInput: (v) => { op = v; mem.opacity = v; View.request(); } }));
      return pad(...inner);
    }
    function refreshPanel() { UI.setPanel(panel()); }
    m.panel = panel();
    Doc.select(null);
    if (mem.tapOnce == null) mem.tapOnce = false;
    UI.enterMode(m);
  };

  /* ============================ MASK (light overlays) ============================ */
  const col = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  /* a soft round light */
  function glow(x, cx, cy, r, c, a, mid) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, col(c, a)); if (mid) g.addColorStop(mid[0], col(c, mid[1])); g.addColorStop(1, col(c, 0));
    x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  function discs(x, W, H, R, n, cols, rMin, rMax, aMin, aMax, ring) {
    const m = Math.min(W, H);
    for (let i = 0; i < n; i++) {
      const cx = R() * W, cy = R() * H, r = (rMin + R() * (rMax - rMin)) * m, c = cols[Math.floor(R() * cols.length)], a = aMin + R() * (aMax - aMin);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, col(c, a * 0.75)); g.addColorStop(0.8, col(c, a * 0.75)); if (ring) g.addColorStop(0.93, col(c, Math.min(1, a * 1.5))); g.addColorStop(1, col(c, 0));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
    }
  }
  function spark(x, cx, cy, r, c, a) {            // a four-pointed twinkle
    glow(x, cx, cy, r * 0.5, c, a * 0.8);
    x.fillStyle = col(c, a); x.beginPath();
    for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, q = i % 2 ? r * 0.09 : r; if (i) x.lineTo(cx + q * Math.cos(an), cy + q * Math.sin(an)); else x.moveTo(cx + q, cy); }
    x.closePath(); x.fill();
  }
  const WARM = [[255, 214, 120], [255, 170, 80], [255, 236, 190], [255, 140, 110]], MULTI = [[255, 120, 160], [120, 200, 255], [255, 220, 120], [170, 140, 255], [140, 255, 200]];
  const MASKS = [
    { id: 'leak1', name: 'Warm leak', blend: 'screen', op: 90, draw: (x, W, H) => { const m = Math.max(W, H); x.globalCompositeOperation = 'lighter'; glow(x, 0, H * 0.3, m * 0.8, [255, 80, 20], 0.95); glow(x, W * 0.12, 0, m * 0.5, [255, 205, 70], 0.8); glow(x, 0, H, m * 0.45, [255, 40, 90], 0.55); } },
    { id: 'leak2', name: 'Cool leak', blend: 'screen', op: 90, draw: (x, W, H) => { const m = Math.max(W, H); x.globalCompositeOperation = 'lighter'; glow(x, W, H * 0.35, m * 0.8, [70, 90, 255], 0.9); glow(x, W * 0.9, H, m * 0.5, [200, 70, 255], 0.75); glow(x, W, 0, m * 0.4, [60, 220, 255], 0.5); } },
    { id: 'leak3', name: 'Sunset band', blend: 'screen', op: 85, draw: (x, W, H) => {
      const g = x.createLinearGradient(0, H * 0.1, W, H * 0.9);
      g.addColorStop(0, 'rgba(255,60,120,0)'); g.addColorStop(0.35, 'rgba(255,70,110,.75)'); g.addColorStop(0.55, 'rgba(255,170,60,.85)'); g.addColorStop(0.72, 'rgba(255,230,120,.5)'); g.addColorStop(1, 'rgba(255,230,120,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    } },
    { id: 'sun', name: 'Sun glow', blend: 'screen', op: 95, draw: (x, W, H) => { const m = Math.max(W, H); x.globalCompositeOperation = 'lighter'; glow(x, W * 0.82, H * 0.12, m * 0.95, [255, 190, 90], 0.75, [0.25, 0.4]); glow(x, W * 0.82, H * 0.12, m * 0.3, [255, 250, 225], 1); } },
    { id: 'rays', name: 'Light rays', blend: 'screen', op: 85, draw: (x, W, H, R) => {
      const m = Math.hypot(W, H);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const a0 = 0.12 + i * 0.16 + R() * 0.05, wd = 0.03 + R() * 0.06, g = x.createLinearGradient(0, 0, Math.cos(a0) * m, Math.sin(a0) * m);
        g.addColorStop(0, 'rgba(255,244,210,' + (0.35 + R() * 0.3).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,244,210,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(-W * 0.03, -H * 0.03); x.lineTo(Math.cos(a0 - wd) * m, Math.sin(a0 - wd) * m); x.lineTo(Math.cos(a0 + wd) * m, Math.sin(a0 + wd) * m); x.closePath(); x.fill();
      }
      glow(x, 0, 0, m * 0.35, [255, 246, 220], 0.8);
    } },
    { id: 'bokeh1', name: 'Bokeh', blend: 'screen', op: 100, draw: (x, W, H, R) => { x.globalCompositeOperation = 'lighter'; discs(x, W, H, R, 46, WARM, 0.025, 0.11, 0.12, 0.42, true); } },
    { id: 'bokeh2', name: 'Colour bokeh', blend: 'screen', op: 100, draw: (x, W, H, R) => { x.globalCompositeOperation = 'lighter'; discs(x, W, H, R, 50, MULTI, 0.02, 0.1, 0.14, 0.42, true); } },
    { id: 'sparkle', name: 'Sparkles', blend: 'screen', op: 100, draw: (x, W, H, R) => { const m = Math.min(W, H); x.globalCompositeOperation = 'lighter'; for (let i = 0; i < 70; i++) spark(x, R() * W, R() * H, (0.008 + Math.pow(R(), 3) * 0.06) * m, [255, 252, 235], 0.5 + R() * 0.5); } },
    { id: 'snow', name: 'Snow', blend: 'source-over', op: 90, draw: (x, W, H, R) => { const m = Math.min(W, H); for (let i = 0; i < 260; i++) { const big = R() < 0.12; glow(x, R() * W, R() * H, (big ? 0.012 + R() * 0.02 : 0.003 + R() * 0.007) * m, [255, 255, 255], big ? 0.45 : 0.95, big ? null : [0.6, 0.8]); } } },
    { id: 'rain', name: 'Rain', blend: 'screen', op: 80, draw: (x, W, H, R) => {
      const m = Math.min(W, H); x.lineCap = 'round';
      for (let i = 0; i < 320; i++) { const px = R() * W * 1.2 - W * 0.1, py = R() * H, len = (0.03 + R() * 0.07) * m; x.strokeStyle = 'rgba(225,238,255,' + (0.18 + R() * 0.45).toFixed(2) + ')'; x.lineWidth = Math.max(0.6, (0.0012 + R() * 0.002) * m); x.beginPath(); x.moveTo(px, py); x.lineTo(px - len * 0.22, py + len); x.stroke(); }
    } },
    { id: 'dust', name: 'Dust', blend: 'screen', op: 75, draw: (x, W, H, R) => {
      const m = Math.min(W, H);
      for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.2 + R() * 0.6).toFixed(2) + ')'; const s = Math.max(0.7, R() * R() * 0.006 * m); x.fillRect(R() * W, R() * H, s, s); }
      x.lineCap = 'round';
      for (let i = 0; i < 26; i++) { const px = R() * W, py = R() * H, len = (0.02 + R() * 0.12) * m, a = R() * 6.28; x.strokeStyle = 'rgba(255,255,255,' + (0.15 + R() * 0.4).toFixed(2) + ')'; x.lineWidth = Math.max(0.6, 0.0012 * m); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * len * 0.5 + (R() - 0.5) * len * 0.4, py + Math.sin(a) * len * 0.5 + (R() - 0.5) * len * 0.4, px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke(); }
    } },
    { id: 'hearts', name: 'Hearts', blend: 'screen', op: 100, draw: (x, W, H, R) => {
      const m = Math.min(W, H);
      for (let i = 0; i < 34; i++) { const s = (0.04 + R() * 0.13) * m, px = R() * W, py = R() * H; x.save(); x.translate(px, py); x.rotate((R() - 0.5) * 0.9); x.globalAlpha = 0.16 + R() * 0.4; x.fillStyle = R() < 0.5 ? '#ff5d8f' : '#ff9ebb'; x.fill(Shapes.path('heart', -s / 2, -s / 2, s, s)); x.restore(); }
    } },
    { id: 'prism', name: 'Rainbow', blend: 'screen', op: 80, draw: (x, W, H) => {
      const g = x.createLinearGradient(W * 0.1, 0, W * 0.9, H), cs = [[255, 0, 80], [255, 150, 0], [255, 240, 0], [60, 230, 90], [0, 170, 255], [150, 80, 255]];
      g.addColorStop(0, col(cs[0], 0)); cs.forEach((c, i) => g.addColorStop(0.3 + i * 0.08, col(c, 0.75))); g.addColorStop(1, col(cs[5], 0));
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    } },
    { id: 'duo', name: 'Dusk tint', blend: 'soft-light', op: 85, draw: (x, W, H) => { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#6b3fd6'); g.addColorStop(1, '#ff9a3d'); x.fillStyle = g; x.fillRect(0, 0, W, H); } },
    { id: 'vignette', name: 'Dark edges', blend: 'source-over', op: 85, draw: (x, W, H) => {
      x.save(); x.translate(W / 2, H / 2); x.scale(W / 2, H / 2);
      const g = x.createRadialGradient(0, 0, 0.55, 0, 0, 1.42); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.92)');
      x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
    } }
  ];
  function paintMask(c, id, seed) {
    const x = c.getContext('2d'), m = MASKS.find((q) => q.id === id) || MASKS[0];
    x.clearRect(0, 0, c.width, c.height);
    x.save(); m.draw(x, c.width, c.height, U.rng(seed || 7)); x.restore();
    return c;
  }
  MaskTool.mem = { id: 'leak1', op: 90, blend: 'screen', seed: 7 };
  MaskTool.open = function () {
    const mem = MaskTool.mem, sz = coverSize(1100);
    const pv = U.canvas(sz[0], sz[1]);
    const update = () => { paintMask(pv, mem.id, mem.seed); View.request(); };
    const slider = UI.slider({ label: 'Opacity', min: 5, max: 100, value: mem.op, onInput: (v) => { mem.op = v; View.request(); } });
    const blends = UI.chips([['screen', 'Screen'], ['source-over', 'Normal'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['lighten', 'Lighten'], ['multiply', 'Multiply']], mem.blend, (v) => { mem.blend = v; View.request(); });
    const again = h('button', { class: 'chip ghost', type: 'button', text: 'Shuffle' });
    U.onTap(again, () => { mem.seed = (Math.random() * 1e6) | 0; update(); });
    const m = {
      title: 'Mask',
      panel: pad(
        strip(MASKS, mem.id, (cv, it) => { const x = cv.getContext('2d'); tile(x, 124); const t = paintMask(U.canvas(124, 124), it.id, 7); x.globalCompositeOperation = it.blend; x.drawImage(t, 0, 0); },
          (it) => { mem.id = it.id; mem.blend = it.blend; mem.op = it.op; slider.set(it.op); blends.set(it.blend); update(); }),
        slider, h('div', { class: 'draw-row' }, blends, again)),
      drawDoc: (ctx) => { ctx.save(); ctx.globalAlpha = mem.op / 100; ctx.globalCompositeOperation = mem.blend; ctx.drawImage(pv, 0, 0, Doc.width, Doc.height); ctx.restore(); },
      compare: { down: () => { MaskTool._off = true; View.request(); }, up: () => { MaskTool._off = false; View.request(); } },
      apply: () => {
        const c = U.canvas(pv.width, pv.height);
        paintMask(c, mem.id, mem.seed);
        addTop(c, 'Mask', { blend: mem.blend, opacity: mem.op / 100, locked: true });      // locked: taps go through it to the things below
        History.commit();
        U.toast('Added as a locked layer on top. Open Layers to pick it again.', 3200);
      }
    };
    const draw = m.drawDoc;
    m.drawDoc = (ctx) => { if (!MaskTool._off) draw(ctx); };
    MaskTool._off = false;
    Doc.select(null);
    update();
    UI.enterMode(m);
  };

  /* ============================ LENS FLARE ============================ */
  function streak(x, cx, cy, len, thick, c, a, ang) {
    x.save(); x.translate(cx, cy); x.rotate(ang || 0); x.scale(len, thick);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, col(c, a)); g.addColorStop(0.25, col(c, a * 0.5)); g.addColorStop(1, col(c, 0));
    x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  function halo(x, cx, cy, r, w, c, a) {
    const g = x.createRadialGradient(cx, cy, Math.max(0, r - w), cx, cy, r + w);
    g.addColorStop(0, col(c, 0)); g.addColorStop(0.5, col(c, a)); g.addColorStop(1, col(c, 0));
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r + w, 0, 6.2832); x.fill();
  }
  const FLARES = [
    { id: 'classic', name: 'Classic', draw: (x, S) => {
      const cx = S * 0.3, cy = S * 0.3;
      glow(x, cx, cy, S * 0.42, [255, 200, 120], 0.55, [0.3, 0.22]); glow(x, cx, cy, S * 0.1, [255, 255, 245], 1);
      streak(x, cx, cy, S * 0.46, S * 0.012, [255, 236, 200], 0.95, 0); streak(x, cx, cy, S * 0.3, S * 0.01, [255, 236, 200], 0.7, Math.PI / 2);
      halo(x, cx, cy, S * 0.2, S * 0.012, [255, 150, 90], 0.5);
      for (const g of [[0.55, 0.05, [120, 255, 170], 0.4], [0.9, 0.035, [255, 180, 90], 0.5], [1.25, 0.085, [120, 170, 255], 0.3], [1.6, 0.05, [255, 120, 200], 0.38], [1.95, 0.11, [150, 255, 240], 0.2]]) {
        const px = cx + (S / 2 - cx) * g[0], py = cy + (S / 2 - cy) * g[0], gr = x.createRadialGradient(px, py, 0, px, py, S * g[1]);
        gr.addColorStop(0, col(g[2], g[3] * 0.5)); gr.addColorStop(0.85, col(g[2], g[3])); gr.addColorStop(1, col(g[2], 0));
        x.fillStyle = gr; x.beginPath(); x.arc(px, py, S * g[1], 0, 6.2832); x.fill();
      }
    } },
    { id: 'blue', name: 'Blue streak', draw: (x, S) => { const c = S / 2; streak(x, c, c, S * 0.5, S * 0.016, [90, 150, 255], 1, 0); streak(x, c, c, S * 0.5, S * 0.05, [80, 120, 255], 0.35, 0); glow(x, c, c, S * 0.22, [110, 160, 255], 0.6); glow(x, c, c, S * 0.06, [235, 245, 255], 1); streak(x, c, c, S * 0.12, S * 0.008, [200, 225, 255], 0.8, Math.PI / 2); } },
    { id: 'star', name: 'Star', draw: (x, S) => { const c = S / 2; glow(x, c, c, S * 0.3, [255, 240, 200], 0.55); for (let i = 0; i < 4; i++) streak(x, c, c, S * (i % 2 ? 0.3 : 0.48), S * 0.011, [255, 250, 230], 0.95, i * Math.PI / 4); glow(x, c, c, S * 0.07, [255, 255, 255], 1); } },
    { id: 'orb', name: 'Warm orb', draw: (x, S) => { const c = S / 2; glow(x, c, c, S * 0.5, [255, 150, 60], 0.6, [0.4, 0.28]); glow(x, c, c, S * 0.2, [255, 225, 150], 0.9); glow(x, c, c, S * 0.08, [255, 255, 240], 1); halo(x, c, c, S * 0.36, S * 0.02, [255, 120, 80], 0.3); } },
    { id: 'ring', name: 'Rainbow ring', draw: (x, S) => { const c = S / 2; glow(x, c, c, S * 0.16, [255, 255, 245], 0.95); [[255, 60, 90], [255, 170, 40], [255, 240, 70], [80, 230, 120], [60, 170, 255], [170, 100, 255]].forEach((q, i) => halo(x, c, c, S * (0.42 - i * 0.022), S * 0.016, q, 0.55)); } },
    { id: 'burst', name: 'Burst', draw: (x, S) => { const c = S / 2, R = U.rng(11); glow(x, c, c, S * 0.34, [255, 232, 190], 0.5); for (let i = 0; i < 26; i++) streak(x, c, c, S * (0.2 + R() * 0.29), S * (0.003 + R() * 0.005), [255, 246, 225], 0.5 + R() * 0.45, i * Math.PI / 13 + R() * 0.1); glow(x, c, c, S * 0.06, [255, 255, 255], 1); } }
  ];
  function paintFlare(S, id) {
    const c = U.canvas(S, S), x = c.getContext('2d'), f = FLARES.find((q) => q.id === id) || FLARES[0];
    x.globalCompositeOperation = 'lighter';
    f.draw(x, S);
    return c;
  }
  FlareTool.open = function () {
    const grid = h('div', { class: 'flare-grid' });
    const sh = UI.sheet('Lens Flare', h('div', null, grid, h('p', { class: 'panel-note', text: 'Tap a flare to add it. Then move, turn and resize it like a sticker.' })));
    for (const f of FLARES) {
      const cv = h('canvas', { width: 150, height: 150 }), x = cv.getContext('2d');
      x.fillStyle = '#0b0d16'; x.fillRect(0, 0, 150, 150); x.globalCompositeOperation = 'lighter'; x.drawImage(paintFlare(150, f.id), 0, 0);
      const b = h('button', { class: 'flare-cell', type: 'button', 'data-id': f.id }, cv, h('span', { text: f.name }));
      U.onTap(b, () => {
        sh.close();
        const pic = paintFlare(760, f.id), l = Layers.image(pic, { name: 'Lens flare', blend: 'screen' });
        const k = Math.min(Doc.width, Doc.height) * 0.95 / pic.width, c = View.toDoc(View.w / 2, View.h / 2);
        l.scaleX = l.scaleY = k; l.x = U.clamp(c[0], 0, Doc.width); l.y = U.clamp(c[1], 0, Doc.height);
        Doc.add(l); Doc.select(l.id); History.commit(); View.request();
      });
      grid.appendChild(b);
    }
  };

  /* ============================ CALLOUT ============================ */
  const BUBBLES = [['round', 'Rounded', 'left'], ['oval', 'Oval', 'left'], ['cloud', 'Thought', 'left'], ['shout', 'Shout', 'none'], ['box', 'Box', 'right']];
  CalloutTool.open = function () {
    const grid = h('div', { class: 'flare-grid' });
    const sh = UI.sheet('Callout', h('div', null, grid, h('p', { class: 'panel-note', text: 'Choose a bubble, then type your words. Colours and the tail can be changed under “Bubble”.' })));
    for (const b of BUBBLES) {
      const bubble = { kind: b[0], fill: '#ffffff', line: '#111111', lw: 5, tail: b[2] };
      const sample = Layers.text('Hi!', { font: Fonts.defaultFor('Hi'), color: '#111111', bubble: bubble, size: 60 });
      const btn = h('button', { class: 'flare-cell light', type: 'button', 'data-id': b[0] }, Layers.thumb(sample, 150), h('span', { text: b[1] }));
      U.onTap(btn, () => { sh.close(); TextTool.add({ color: '#111111', bubble: Object.assign({}, bubble) }); });
      grid.appendChild(btn);
    }
  };
  FrameTool._list = FRAMES; MaskTool._list = MASKS; FlareTool._list = FLARES;
  MaskTool.paint = paintMask; FrameTool.paint = paintFrame;
})();
