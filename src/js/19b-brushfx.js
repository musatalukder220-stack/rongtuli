'use strict';
/* ============================================================
 * 19b-brushfx.js : tools you paint with
 *   BrushesTool - stamp brushes (stars, hearts, bubbles, confetti …); the strokes become a new layer
 *   RetouchTool - rub a correction onto a photo: smooth, blemish, details, brighten, darken, whiten, colour, red eye
 *   CloneTool   - copy one part of a photo over another part
 * ============================================================ */
const BrushesTool = {};
const RetouchTool = {};
const CloneTool = {};
(function () {
  const h = U.h;
  const pad = (...kids) => h('div', { class: 'panel-pad' }, kids);
  const note = (t) => h('p', { class: 'panel-note', text: t });

  /* call fn(x, y, angle) every `step` px along the line p = [x0, y0, x1, y1, …] */
  function walk(p, step, fn) {
    let acc = 0;
    fn(p[0], p[1], 0);
    for (let i = 2; i < p.length; i += 2) {
      const dx = p[i] - p[i - 2], dy = p[i + 1] - p[i - 1], len = Math.hypot(dx, dy);
      if (!len) continue;
      const ang = Math.atan2(dy, dx);
      let pos = step - acc;
      while (pos <= len) { fn(p[i - 2] + dx * pos / len, p[i - 1] + dy * pos / len, ang); pos += step; }
      acc = len - (pos - step);
    }
  }
  /* a point of the canvas (document px) -> px of the layer's picture */
  function toBmp(l, d) {
    const dx = d[0] - l.x, dy = d[1] - l.y, c = Math.cos(-l.rotation), s = Math.sin(-l.rotation);
    let lx = (dx * c - dy * s) / l.scaleX, ly = (dx * s + dy * c) / l.scaleY;
    if (l.flipH) lx = -lx;
    if (l.flipV) ly = -ly;
    return [lx + l.bitmap.width / 2, ly + l.bitmap.height / 2];
  }
  const toDocPt = (l, q) => {       // and back
    const lx = (q[0] - l.bitmap.width / 2) * l.scaleX * (l.flipH ? -1 : 1), ly = (q[1] - l.bitmap.height / 2) * l.scaleY * (l.flipV ? -1 : 1), c = Math.cos(l.rotation), s = Math.sin(l.rotation);
    return [l.x + lx * c - ly * s, l.y + lx * s + ly * c];
  };
  /* one piece of a soft brush line on a mask canvas (white = painted) */
  function softLine(x, x0, y0, x1, y1, r, softPct, erase) {
    const soft = softPct / 100 * r * 1.2, c = x.canvas;
    x.save();
    x.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#fff'; x.lineWidth = Math.max(1, 2 * r - soft);
    if (soft > 0.5) { const OFF = c.width + c.height + 4 * r + 100; x.shadowColor = '#fff'; x.shadowBlur = soft; x.shadowOffsetX = OFF; x.translate(-OFF, 0); }
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1 + 0.01, y1 + 0.01); x.stroke();
    x.restore();
  }
  function brushRing(ctx, v, at, r, fill) {
    const c = at || [v.w / 2, v.h / 2];
    ctx.save(); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(2, r), 0, 6.2832);
    ctx.fillStyle = fill || 'rgba(255,255,255,.18)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  }

  /* ============================ BRUSHES (stamps) ============================ */
  const RAINBOW = ['#ef4444', '#f97316', '#fde047', '#22c55e', '#3b82f6', '#8b5cf6'];
  const PARTY = ['#f43f5e', '#f59e0b', '#fde047', '#22c55e', '#06b6d4', '#6366f1', '#d946ef'];
  function shade(hex, f) { const c = U.hexToRgb(hex); return U.rgbToHex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f); }
  function stampStroke(ctx, s) {
    const R = U.rng(s.seed), p = s.pts, z = s.size;
    ctx.save(); ctx.globalAlpha = s.alpha;
    const shapeStamp = (id, step, lo, hi, cols) => walk(p, z * step, (x, y) => {
      const d = z * (lo + R() * (hi - lo)), jx = (R() - 0.5) * z * 0.9, jy = (R() - 0.5) * z * 0.9;
      ctx.save(); ctx.translate(x + jx, y + jy); ctx.rotate((R() - 0.5) * 1.6);
      ctx.fillStyle = cols ? cols[Math.floor(R() * cols.length)] : shade(s.color, R() * 0.45);
      ctx.fill(Shapes.path(id, -d / 2, -d / 2, d, d)); ctx.restore();
    });
    if (s.tool === 'stars') shapeStamp('star', 0.95, 0.5, 1.5);
    else if (s.tool === 'hearts') shapeStamp('heart', 1.0, 0.55, 1.4);
    else if (s.tool === 'flowers') shapeStamp('flower', 1.05, 0.6, 1.5);
    else if (s.tool === 'confetti') walk(p, z * 0.42, (x, y) => {
      const w = z * (0.25 + R() * 0.4), hh = w * (0.35 + R() * 0.5);
      ctx.save(); ctx.translate(x + (R() - 0.5) * z * 2, y + (R() - 0.5) * z * 2); ctx.rotate(R() * 6.28);
      ctx.fillStyle = PARTY[Math.floor(R() * PARTY.length)]; ctx.fillRect(-w / 2, -hh / 2, w, hh); ctx.restore();
    });
    else if (s.tool === 'bubbles') walk(p, z * 0.9, (x, y) => {
      const r = z * (0.25 + R() * 0.65), cx = x + (R() - 0.5) * z * 1.3, cy = y + (R() - 0.5) * z * 1.3;
      ctx.lineWidth = Math.max(1, r * 0.13); ctx.strokeStyle = shade(s.color, 0.25 + R() * 0.4);
      ctx.fillStyle = U.rgba(shade(s.color, 0.5), 0.2);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.38, r * 0.16, 0, 6.2832); ctx.fill();
    });
    else if (s.tool === 'sparkle') walk(p, z * 0.8, (x, y) => {
      const r = z * (0.3 + Math.pow(R(), 2) * 1.2), cx = x + (R() - 0.5) * z * 1.6, cy = y + (R() - 0.5) * z * 1.6;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.7);
      g.addColorStop(0, U.rgba(shade(s.color, 0.6), 0.8)); g.addColorStop(1, U.rgba(s.color, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      ctx.fillStyle = shade(s.color, 0.85); ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * 0.1 : r; if (i) ctx.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a)); else ctx.moveTo(cx + q, cy); }
      ctx.closePath(); ctx.fill();
    });
    else if (s.tool === 'snow') walk(p, z * 0.5, (x, y) => {
      const r = z * (0.12 + R() * 0.3), cx = x + (R() - 0.5) * z * 2.4, cy = y + (R() - 0.5) * z * 2.4;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.55, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    });
    else if (s.tool === 'dots') walk(p, z * 1.5, (x, y) => { ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x, y, z * 0.5, 0, 6.2832); ctx.fill(); });
    else {                                               // rainbow ribbon: six bands side by side
      const n = p.length / 2, band = z * 1.5 / RAINBOW.length;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = band * 1.12;
      for (let b = 0; b < RAINBOW.length; b++) {
        const off = (b - (RAINBOW.length - 1) / 2) * band;
        ctx.strokeStyle = RAINBOW[b]; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = Math.max(0, i - 1), c = Math.min(n - 1, i + 1);
          let nx = -(p[c * 2 + 1] - p[a * 2 + 1]), ny = p[c * 2] - p[a * 2];
          const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
          if (n === 1) { nx = 0; ny = 1; }
          const X = p[i * 2] + nx * off, Y = p[i * 2 + 1] + ny * off;
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        if (n === 1) ctx.lineTo(p[0] + 0.01, p[1] + off + 0.01);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  BrushesTool.mem = { tool: 'stars', color: '#fde047', size: 26, opacity: 100 };
  BrushesTool.open = function () {
    const mem = BrushesTool.mem, W = Doc.width, H = Doc.height, unit = Math.max(W, H) / 1000;
    const done = U.canvas(W, H), dctx = done.getContext('2d');
    const strokes = [];
    let undone = [], live = null, hintUntil = 0;
    const docSize = () => Math.max(2, mem.size * unit);
    const rebuild = () => { dctx.clearRect(0, 0, W, H); for (const s of strokes) stampStroke(dctx, s); };
    const TOOLS = [['stars', 'Stars', 'star'], ['hearts', 'Hearts', 'heart'], ['sparkle', 'Sparkle', 'sparkle'], ['bubbles', 'Bubbles', 'blurdot'], ['confetti', 'Confetti', 'spray'],
      ['flowers', 'Flowers', 'sticker'], ['snow', 'Snow', 'spray'], ['rainbow', 'Rainbow', 'marker'], ['dots', 'Dots', 'size']];
    const hint = () => { hintUntil = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    Doc.select(null);
    const m = {
      title: 'Brushes',
      items: TOOLS.map((t) => ({ id: t[0], icon: t[2], label: t[1], onTap: () => { mem.tool = t[0]; UI.markActive(t[0]); } })),
      panel: pad(
        UI.palette({ value: mem.color, onPick: (c) => { mem.color = c; } }),
        UI.slider({ label: 'Size', min: 6, max: 100, value: mem.size, onInput: (v) => { mem.size = v; hint(); } }),
        UI.slider({ label: 'Opacity', min: 10, max: 100, value: mem.opacity, onInput: (v) => { mem.opacity = v; } })),
      history: {
        canUndo: () => strokes.length > 0, canRedo: () => undone.length > 0,
        undo: () => { if (strokes.length) { undone.push(strokes.pop()); rebuild(); View.request(); } },
        redo: () => { if (undone.length) { const s = undone.pop(); strokes.push(s); stampStroke(dctx, s); View.request(); } }
      },
      pointerDown: (p) => {
        const d = View.toDoc(p[0], p[1]);
        live = { tool: mem.tool, color: mem.color, size: docSize(), alpha: mem.opacity / 100, pts: [d[0], d[1]], seed: (Math.random() * 1e9) | 0, last: p };
        View.request();
      },
      pointerMove: (p) => {
        if (!live || Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 2) return;
        live.last = p;
        const d = View.toDoc(p[0], p[1]);
        live.pts.push(d[0], d[1]);
        View.request();
      },
      pointerUp: () => {
        if (!live) return;
        const s = live; live = null; delete s.last;
        strokes.push(s); undone = [];
        stampStroke(dctx, s);
        UI.refreshTop(); View.request();
      },
      pointerCancel: () => { live = null; View.request(); },
      drawDoc: (ctx) => { ctx.drawImage(done, 0, 0); if (live) stampStroke(ctx, live); },
      overlay: (ctx, v) => { if (Date.now() < hintUntil) brushRing(ctx, v, null, docSize() * v.scale / 2, U.rgba(mem.color, 0.5)); },
      apply: () => {
        if (!strokes.length) return;
        const t = U.trimCanvas(done, 2);
        if (!t) return;
        const l = Layers.image(t.canvas, { name: 'Brush', x: t.x + t.canvas.width / 2, y: t.y + t.canvas.height / 2 });
        Doc.add(l); Doc.selectedId = l.id; History.commit();
      }
    };
    UI.enterMode(m);
    UI.markActive(mem.tool);
  };

  /* ============================ RETOUCH ============================ */
  const adjusted = (p) => (c) => { const img = IP.read(c); IP.adjust(img, img, p, null); return IP.write(img); };
  const RET = [
    { id: 'smooth', icon: 'retouch', name: 'Smooth', hint: 'Rub over skin to make it smoother.', make: (c) => IP.write(IP.blur(IP.read(c), Math.max(2.5, Math.max(c.width, c.height) / 280))) },
    { id: 'blemish', icon: 'target', name: 'Blemish', hint: 'Tap or rub a spot to hide it.', make: (c) => IP.write(IP.blur(IP.read(c), Math.max(5, Math.max(c.width, c.height) / 110))) },
    { id: 'details', icon: 'clarity', name: 'Details', hint: 'Rub to make eyes, hair or cloth sharper.', make: (c) => IP.write(IP.sharpen(IP.read(c), 1.3, Math.max(1.2, Math.max(c.width, c.height) / 900))) },
    { id: 'brighten', icon: 'brightness', name: 'Brighten', hint: 'Rub to lighten a part.', make: adjusted({ brightness: 26, shadows: 22 }) },
    { id: 'darken', icon: 'shadows', name: 'Darken', hint: 'Rub to darken a part.', make: adjusted({ brightness: -28, contrast: 6 }) },
    { id: 'whiten', icon: 'highlights', name: 'Whiten', hint: 'Rub over teeth or the white of the eyes.', make: adjusted({ saturation: -72, brightness: 14 }) },
    { id: 'colour', icon: 'saturation', name: 'Colour', hint: 'Rub to make colours stronger (lips, sky, flowers).', make: adjusted({ saturation: 58 }) },
    { id: 'redeye', icon: 'eye', name: 'Red eye', hint: 'Tap the red pupils.', make: (c) => {
      const img = IP.read(c), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 60 && r > 1.45 * Math.max(g, b)) d[i] = (g + b) / 2 * 0.9; }
      return IP.write(img);
    } }
  ];
  RetouchTool.mem = { tool: 'smooth', size: 44, strength: 75 };
  RetouchTool.open = function (target) {
    const l = target && target.type === 'image' ? target : Doc.targetImage();
    if (!l) { U.toast('Add a photo first'); return; }
    const mem = RetouchTool.mem, src = l.bitmap, W = src.width, H = src.height;
    const out = U.canvas(W, H), ox = out.getContext('2d'), tmp = U.canvas(W, H), tx = tmp.getContext('2d');
    const T = {};                                 // per kind: { variant, mask, mx, used }
    const strokes = [];                           // { tool, pts (px of the photo), r, strength }
    let undone = [], live = null, finger = null, showing = true, hintUntil = 0;
    const get = (id) => {
      let t = T[id];
      if (!t) { const mask = U.canvas(W, H); t = T[id] = { variant: null, mask: mask, mx: mask.getContext('2d'), used: false, strength: mem.strength / 100 }; }
      if (!t.variant) t.variant = RET.find((q) => q.id === id).make(src);
      return t;
    };
    const radius = () => Math.max(2, mem.size / 2 / (View.scale * Math.abs(l.scaleX)));
    function compose() {
      ox.globalCompositeOperation = 'copy'; ox.drawImage(src, 0, 0); ox.globalCompositeOperation = 'source-over';
      for (const id in T) {
        const t = T[id];
        if (!t.used) continue;
        tx.globalCompositeOperation = 'copy'; tx.drawImage(t.variant, 0, 0);
        tx.globalCompositeOperation = 'destination-in'; tx.drawImage(t.mask, 0, 0);
        ox.globalAlpha = t.strength; ox.drawImage(tmp, 0, 0); ox.globalAlpha = 1;
      }
      tx.globalCompositeOperation = 'source-over';
    }
    const show = () => { if (showing && strokes.length + (live ? 1 : 0) > 0) { compose(); View.overrides.set(l.id, out); } else View.overrides.delete(l.id); View.request(); };
    const drawStroke = (s) => { const t = get(s.tool), p = s.pts; t.used = true; t.strength = s.strength; if (p.length === 2) softLine(t.mx, p[0], p[1], p[0], p[1], s.r, 60); for (let i = 2; i < p.length; i += 2) softLine(t.mx, p[i - 2], p[i - 1], p[i], p[i + 1], s.r, 60); };
    const rebuild = () => { for (const id in T) { T[id].mx.clearRect(0, 0, W, H); T[id].used = false; } for (const s of strokes) drawStroke(s); show(); };
    const hintText = h('p', { class: 'panel-note' });
    function pick(id) { mem.tool = id; UI.markActive(id); hintText.textContent = RET.find((q) => q.id === id).hint; }
    const ring = () => { hintUntil = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    const m = {
      title: 'Retouch',
      items: RET.map((r) => ({ id: r.id, icon: r.icon, label: r.name, onTap: () => pick(r.id) })),
      panel: pad(
        UI.slider({ label: 'Size', min: 8, max: 160, value: mem.size, onInput: (v) => { mem.size = v; ring(); } }),
        UI.slider({ label: 'Strength', min: 10, max: 100, value: mem.strength, onInput: (v) => { mem.strength = v; const t = T[mem.tool]; if (t) { t.strength = v / 100; for (const s of strokes) if (s.tool === mem.tool) s.strength = v / 100; show(); } } }),
        hintText),
      compare: { down: () => { showing = false; show(); }, up: () => { showing = true; show(); } },
      history: {
        canUndo: () => strokes.length > 0, canRedo: () => undone.length > 0,
        undo: () => { if (strokes.length) { undone.push(strokes.pop()); rebuild(); } },
        redo: () => { if (undone.length) { const s = undone.pop(); strokes.push(s); drawStroke(s); show(); } }
      },
      pointerDown: (p) => {
        finger = p;
        const q = toBmp(l, View.toDoc(p[0], p[1])), t = get(mem.tool);
        live = { tool: mem.tool, pts: [q[0], q[1]], r: radius(), strength: mem.strength / 100, last: p };
        t.used = true; t.strength = live.strength;
        softLine(t.mx, q[0], q[1], q[0], q[1], live.r, 60);
        show();
      },
      pointerMove: (p) => {
        finger = p;
        if (!live || Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 2) { View.request(); return; }
        live.last = p;
        const q = toBmp(l, View.toDoc(p[0], p[1])), n = live.pts.length;
        softLine(T[live.tool].mx, live.pts[n - 2], live.pts[n - 1], q[0], q[1], live.r, 60);
        live.pts.push(q[0], q[1]);
        show();
      },
      pointerUp: () => { finger = null; if (!live) return; const s = live; live = null; delete s.last; strokes.push(s); undone = []; UI.refreshTop(); show(); },
      pointerCancel: () => { finger = null; if (live) { live = null; rebuild(); } },
      overlay: (ctx, v) => { if (finger || Date.now() < hintUntil) brushRing(ctx, v, finger, mem.size / 2); },
      apply: async () => {
        if (!strokes.length) return;
        await U.busy(() => { compose(); l.bitmap = U.cloneCanvas(out); delete l.shape; History.commit(); }, 'Applying…');
      }
    };
    UI.enterMode(m);
    pick(mem.tool);
  };

  /* ============================ CLONE ============================ */
  CloneTool.mem = { size: 60, soft: 50 };
  CloneTool.open = function (target) {
    const l = target && target.type === 'image' ? target : Doc.targetImage();
    if (!l) { U.toast('Add a photo first'); return; }
    const mem = CloneTool.mem, src = l.bitmap, W = src.width, H = src.height;
    const out = U.cloneCanvas(src), ox = out.getContext('2d');
    const strokes = [];                           // { pts, r, soft, dx, dy }: paint at pts what is at pts - (dx, dy)
    let undone = [], live = null, source = null, off = null, picking = true, finger = null, hintUntil = 0;
    const radius = () => Math.max(2, mem.size / 2 / (View.scale * Math.abs(l.scaleX)));
    /* one soft round dab: a piece of the untouched photo from (x - dx, y - dy), laid at (x, y) */
    let dabC = null, dabX = null;
    function dab(x, y, s) {
      const r = s.r, D = Math.ceil(2 * r + 2);
      if (!dabC || dabC.width !== D) { dabC = U.canvas(D, D); dabX = dabC.getContext('2d'); }
      const x0 = Math.round(x - D / 2), y0 = Math.round(y - D / 2);
      dabX.globalCompositeOperation = 'copy';
      dabX.drawImage(src, x0 - s.dx, y0 - s.dy, D, D, 0, 0, D, D);
      const inner = r * Math.max(0, 1 - s.soft / 100);
      dabX.globalCompositeOperation = 'destination-in';
      if (inner > r - 0.6) { dabX.fillStyle = '#000'; dabX.beginPath(); dabX.arc(x - x0, y - y0, r, 0, 6.2832); dabX.fill(); }      // a hard edge (two equal circles would make an empty gradient)
      else {
        const g = dabX.createRadialGradient(x - x0, y - y0, inner, x - x0, y - y0, r);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        dabX.fillStyle = g; dabX.fillRect(0, 0, D, D);
      }
      ox.drawImage(dabC, x0, y0);
    }
    const paint = (s, from) => {                 // from: index of the first point of the new piece (0 = whole stroke)
      const p = from ? s.pts.slice(from - 2) : s.pts;
      walk(p, Math.max(1, s.r * 0.3), (x, y) => dab(x, y, s));
    };
    const rebuild = () => { ox.globalCompositeOperation = 'copy'; ox.drawImage(src, 0, 0); ox.globalCompositeOperation = 'source-over'; for (const s of strokes) paint(s, 0); show(); };
    const show = () => { if (strokes.length + (live ? 1 : 0) > 0) View.overrides.set(l.id, out); else View.overrides.delete(l.id); View.request(); };
    const hintText = note('');
    const say = () => { hintText.textContent = picking ? 'First tap the place to copy FROM.' : 'Now rub where it should be copied TO. “Source” picks another place.'; };
    const ring = () => { hintUntil = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    const m = {
      title: 'Clone',
      items: [{ id: 'source', icon: 'target', label: 'Source', onTap: () => { picking = true; off = null; UI.markActive('source'); say(); View.request(); } }],
      panel: pad(
        UI.slider({ label: 'Size', min: 10, max: 200, value: mem.size, onInput: (v) => { mem.size = v; ring(); } }),
        UI.slider({ label: 'Soft edge', min: 0, max: 100, value: mem.soft, onInput: (v) => { mem.soft = v; } }),
        hintText),
      compare: { down: () => { View.overrides.delete(l.id); View.request(); }, up: show },
      history: {
        canUndo: () => strokes.length > 0, canRedo: () => undone.length > 0,
        undo: () => { if (strokes.length) { undone.push(strokes.pop()); rebuild(); } },
        redo: () => { if (undone.length) { const s = undone.pop(); strokes.push(s); paint(s, 0); show(); } }
      },
      pointerDown: (p) => {
        finger = p;
        const q = toBmp(l, View.toDoc(p[0], p[1]));
        if (picking) { live = { pick: q }; return; }
        if (!off) off = [q[0] - source[0], q[1] - source[1]];                 // the distance stays the same for all later strokes
        live = { pts: [q[0], q[1]], r: radius(), soft: mem.soft, dx: off[0], dy: off[1], last: p };
        dab(q[0], q[1], live); show();
      },
      pointerMove: (p) => {
        finger = p;
        if (!live || live.pick) { View.request(); return; }
        if (Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 2) return;
        live.last = p;
        const q = toBmp(l, View.toDoc(p[0], p[1]));
        live.pts.push(q[0], q[1]);
        paint(live, live.pts.length - 2); show();
      },
      pointerUp: () => {
        finger = null;
        if (!live) return;
        if (live.pick) { source = live.pick; live = null; picking = false; off = null; UI.markActive(null); say(); View.request(); return; }
        const s = live; live = null; delete s.last; strokes.push(s); undone = []; UI.refreshTop(); show();
      },
      pointerCancel: () => { finger = null; if (live && !live.pick) { live = null; rebuild(); } else live = null; },
      overlay: (ctx, v) => {
        const r = mem.size / 2;
        if (finger && !picking) brushRing(ctx, v, finger, r);
        else if (Date.now() < hintUntil) brushRing(ctx, v, null, r);
        // the place that is being copied from: a cross that travels with the finger
        let at = null;
        if (source && !picking) { at = live && !live.pick ? [live.pts[live.pts.length - 2] - live.dx, live.pts[live.pts.length - 1] - live.dy] : source; }
        if (at) {
          const d = toDocPt(l, at), c = v.toView(d[0], d[1]);
          ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 3;
          ctx.beginPath(); ctx.arc(c[0], c[1], 9, 0, 6.2832); ctx.moveTo(c[0] - 15, c[1]); ctx.lineTo(c[0] + 15, c[1]); ctx.moveTo(c[0], c[1] - 15); ctx.lineTo(c[0], c[1] + 15); ctx.stroke(); ctx.restore();
        }
      },
      apply: () => { if (!strokes.length) return; l.bitmap = U.cloneCanvas(out); delete l.shape; History.commit(); }
    };
    UI.enterMode(m);
    UI.markActive('source'); say();
  };
  BrushesTool._walk = walk; RetouchTool._toBmp = toBmp; RetouchTool._softLine = softLine; RetouchTool._ring = brushRing;
})();
