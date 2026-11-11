'use strict';
/* ============================================================
 * 10-draw.js : Draw – freehand strokes with a few brushes.
 * The strokes become one new layer when the tick is pressed.
 * ============================================================ */
const DrawTool = {};
(function () {
  const h = U.h;
  const mem = { tool: 'pen', color: '#f43f5e', size: 12, opacity: 100 };     // remembered between uses

  function trace(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    if (p.length === 2) { ctx.lineTo(p[0] + 0.01, p[1] + 0.01); return; }
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  /* k = screen pixels per picture pixel (blur sizes are always in screen pixels) */
  function paint(ctx, s, k) {
    const p = s.pts;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.lineWidth = s.size;
      trace(ctx, p); ctx.stroke();
    } else if (s.tool === 'pen') {
      ctx.globalAlpha = s.alpha; ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
      trace(ctx, p); ctx.stroke();
    } else if (s.tool === 'marker') {
      ctx.globalAlpha = s.alpha * 0.45; ctx.strokeStyle = s.color; ctx.lineWidth = s.size * 1.7;
      trace(ctx, p); ctx.stroke();
    } else if (s.tool === 'neon') {
      ctx.globalAlpha = s.alpha;
      ctx.shadowColor = s.color; ctx.shadowBlur = s.size * 1.5 * k; ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
      trace(ctx, p); ctx.stroke(); ctx.stroke();
      ctx.shadowBlur = s.size * 0.4 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, s.size * 0.42);
      trace(ctx, p); ctx.stroke();
    } else if (s.tool === 'spray') {
      const rnd = U.rng(s.seed), R = s.size * 1.4, dot = Math.max(0.9, s.size * 0.11), step = Math.max(1, s.size * 0.28);
      ctx.fillStyle = s.color; ctx.globalAlpha = s.alpha;
      const burst = (x, y) => { for (let i = 0; i < 8; i++) { const a = rnd() * 6.2832, r = R * Math.sqrt(rnd()); ctx.fillRect(x + r * Math.cos(a) - dot / 2, y + r * Math.sin(a) - dot / 2, dot, dot); } };
      burst(p[0], p[1]); burst(p[0], p[1]);
      let acc = 0;
      for (let i = 2; i < p.length; i += 2) {
        const dx = p[i] - p[i - 2], dy = p[i + 1] - p[i - 1], len = Math.hypot(dx, dy);
        if (!len) continue;
        let pos = step - acc;
        while (pos <= len) { burst(p[i - 2] + dx * pos / len, p[i - 1] + dy * pos / len); pos += step; }
        acc = len - (pos - step);
      }
    }
    ctx.restore();
  }

  DrawTool.open = function () {
    const W = Doc.width, H = Doc.height, unit = Math.max(W, H) / 1000;
    const done = U.canvas(W, H), dctx = done.getContext('2d');
    const strokes = [];
    let undone = [], live = null, sizeHint = 0;
    const docSize = () => Math.max(1, mem.size * unit);
    const rebuild = () => { dctx.clearRect(0, 0, W, H); for (const s of strokes) paint(dctx, s, 1); };
    Doc.select(null);

    const TOOLS = [['pen', 'Pen'], ['marker', 'Marker'], ['neon', 'Neon'], ['spray', 'Spray'], ['eraser', 'Eraser']];
    const items = TOOLS.map((t) => ({ id: t[0], icon: t[0], label: t[1], onTap: () => { mem.tool = t[0]; UI.markActive(t[0]); } }));
    const hint = () => { sizeHint = Date.now() + 900; View.request(); setTimeout(() => View.request(), 950); };
    const panel = h('div', { class: 'panel-pad' },
      UI.palette({ value: mem.color, onPick: (c) => { mem.color = c; if (mem.tool === 'eraser') { mem.tool = 'pen'; UI.markActive('pen'); } } }),
      UI.slider({ label: 'Size', min: 1, max: 100, value: mem.size, onInput: (v) => { mem.size = v; hint(); } }),
      UI.slider({ label: 'Opacity', min: 5, max: 100, value: mem.opacity, onInput: (v) => { mem.opacity = v; } }));

    const m = {
      title: 'Draw', items: items, panel: panel,
      history: {
        canUndo: () => strokes.length > 0, canRedo: () => undone.length > 0,
        undo: () => { if (strokes.length) { undone.push(strokes.pop()); rebuild(); View.request(); } },
        redo: () => { if (undone.length) { const s = undone.pop(); strokes.push(s); paint(dctx, s, 1); View.request(); } }
      },
      pointerDown: (p) => {
        const d = View.toDoc(p[0], p[1]);
        live = { tool: mem.tool, color: mem.color, size: docSize(), alpha: mem.opacity / 100, pts: [d[0], d[1]], seed: (Math.random() * 1e9) | 0, last: p };
        if (live.tool === 'eraser') paint(dctx, { tool: 'eraser', size: live.size, pts: [d[0], d[1]] }, 1);
        View.request();
      },
      pointerMove: (p) => {
        if (!live) return;
        if (Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 1.6) return;
        live.last = p;
        const d = View.toDoc(p[0], p[1]), q = live.pts, n = q.length;
        q.push(d[0], d[1]);
        if (live.tool === 'eraser') paint(dctx, { tool: 'eraser', size: live.size, pts: [q[n - 2], q[n - 1], d[0], d[1]] }, 1);   // rub out as the finger moves
        View.request();
      },
      pointerUp: () => {
        if (!live) return;
        const s = live; live = null;
        delete s.last;
        strokes.push(s); undone = [];
        if (s.tool === 'eraser') rebuild(); else paint(dctx, s, 1);
        UI.refreshTop(); View.request();
      },
      pointerCancel: () => { if (live) { const er = live.tool === 'eraser'; live = null; if (er) rebuild(); View.request(); } },
      drawDoc: (ctx, v) => {
        ctx.drawImage(done, 0, 0);
        if (live && live.tool !== 'eraser') paint(ctx, live, v.scale * v.dpr);
      },
      overlay: (ctx, v) => {
        if (Date.now() > sizeHint) return;
        const r = Math.max(1, docSize() * v.scale / 2);
        ctx.save();
        ctx.beginPath(); ctx.arc(v.w / 2, v.h / 2, r, 0, 6.2832);
        ctx.fillStyle = mem.tool === 'eraser' ? 'rgba(255,255,255,.35)' : U.rgba(mem.color, 0.75); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.restore();
      },
      apply: () => {
        if (!strokes.length) return;
        const t = U.trimCanvas(done, 2);
        if (!t) return;
        const l = Layers.image(t.canvas, { name: 'Drawing', x: t.x + t.canvas.width / 2, y: t.y + t.canvas.height / 2 });
        Doc.add(l); Doc.selectedId = l.id; History.commit();
      }
    };
    UI.enterMode(m);
    UI.markActive(mem.tool);
  };
})();
