'use strict';
/* ============================================================
 * 05-view.js : the on-screen canvas. Draws the document, the
 * selection box, and turns finger / mouse input into moves,
 * resizes, rotations and zooming.
 * ============================================================ */
const View = {
  el: null, canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  scale: 1, tx: 0, ty: 0, fitScale: 1, pad: 14,
  mode: null,                 // the active tool (crop, draw, ...) or null
  overrides: new Map(),       // layer id -> canvas shown instead of its bitmap (live previews)
  hide: new Set(),
  guides: null, dirty: false, _raf: 0, _checker: null
};
(function () {
  const TAP_SLOP = 7, HANDLE_R = 13, HANDLE_HIT = 21;
  const ACCENT = '#f04be0';

  View.init = function (stage, canvas) {
    this.el = stage; this.canvas = canvas; this.ctx = canvas.getContext('2d');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.resize();
  };
  View.resize = function () {
    const r = this.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const wasFit = Math.abs(this.scale - this.fitScale) < 1e-6 || !this.w;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);      // more than 2 buys nothing on a phone and costs a lot of drawing
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (Doc.open) {
      this.computeFit();
      if (wasFit || this.scale < this.fitScale) this.fit(); else this.clampPan();
    }
    this.render();
  };
  View.computeFit = function () {
    const p = this.pad;
    this.fitScale = Math.max(0.001, Math.min((this.w - 2 * p) / Doc.width, (this.h - 2 * p) / Doc.height));
  };
  View.fit = function (pad) {
    if (!Doc.open || !this.w) return;
    if (pad != null) this.pad = pad;
    this._dw = Doc.width; this._dh = Doc.height;
    this.computeFit();
    this.scale = this.fitScale;
    this.tx = (this.w - Doc.width * this.scale) / 2;
    this.ty = (this.h - Doc.height * this.scale) / 2;
    this.request();
  };
  /* call after the document may have changed size (crop, resize, rotate, undo) */
  View.sync = function () {
    if (!Doc.open) { this.request(); return; }
    if (Doc.width !== this._dw || Doc.height !== this._dh) this.fit(); else this.request();
  };
  View.clampPan = function () {
    const dw = Doc.width * this.scale, dh = Doc.height * this.scale, m = 60;
    if (dw <= this.w) this.tx = (this.w - dw) / 2; else this.tx = U.clamp(this.tx, this.w - dw - m, m);
    if (dh <= this.h) this.ty = (this.h - dh) / 2; else this.ty = U.clamp(this.ty, this.h - dh - m, m);
  };
  View.toDoc = function (vx, vy) { return [(vx - this.tx) / this.scale, (vy - this.ty) / this.scale]; };
  View.toView = function (x, y) { return [x * this.scale + this.tx, y * this.scale + this.ty]; };
  View.request = function () { if (!this._raf) this._raf = requestAnimationFrame(() => this.render()); };

  View.checker = function (ctx) {
    if (!this._checker) {
      const c = U.canvas(20, 20), x = c.getContext('2d');
      x.fillStyle = '#2b2b2b'; x.fillRect(0, 0, 20, 20);
      x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, 10, 10); x.fillRect(10, 10, 10, 10);
      this._checker = c;
    }
    return ctx.createPattern(this._checker, 'repeat');
  };

  View.render = function () {
    this._raf = 0;
    const ctx = this.ctx, dpr = this.dpr;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!Doc.open) return;
    const m = this.mode;
    if (m && m.render) { m.render(ctx, this); return; }
    const s = this.scale, W = Doc.width, H = Doc.height;
    ctx.save();
    ctx.beginPath(); ctx.rect(this.tx, this.ty, W * s, H * s); ctx.clip();
    if (Doc.bg.type !== 'color') { ctx.fillStyle = this.checker(ctx); ctx.fillRect(this.tx, this.ty, W * s, H * s); }
    ctx.translate(this.tx, this.ty); ctx.scale(s, s);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';      // 'high' is slow on phone graphics chips; the saved picture keeps 'high'
    Doc.composite(ctx, { overrides: this.overrides, hide: this.hide });
    if (m && m.drawDoc) m.drawDoc(ctx, this);
    ctx.restore();
    if (m) { if (m.overlay) m.overlay(ctx, this); }
    else this.drawSelection(ctx);
  };

  /* ---------- selection box + handles ---------- */
  View.selGeom = function (l) {
    const sz = Layers.size(l), s = this.scale;
    /* For text the frame hugs the letters themselves (as in the owner's reference video): the drawn picture
       has room around the words for a stroke, which would otherwise show as a loose empty box. */
    let hw, hh, ox = 0, oy = 0;
    const tb = l.type === 'text' && l._cache && l._cache.tb;
    if (tb) {
      const sw = Math.abs(l.scaleX || 1), sh = Math.abs(l.scaleY || 1);
      hw = Math.max(tb.W * sw * s / 2, 12) + 4;
      hh = Math.max(tb.H * sh * s / 2, 12) + 4;
      ox = (tb.X0 + tb.W / 2) * (l.scaleX || 1) * s;
      oy = (tb.Y0 + tb.H / 2) * (l.scaleY || 1) * s;
    } else {
      hw = Math.max(sz.w * l.scaleX * s / 2, 14) + 5; hh = Math.max(sz.h * l.scaleY * s / 2, 14) + 5;
    }
    const c = Math.cos(l.rotation), sn = Math.sin(l.rotation);
    const ctr = this.toView((l.type === 'text' && TextRender.baseX) ? TextRender.baseX(l) : l.x, l.y);
    ctr[0] += ox * c - oy * sn; ctr[1] += ox * sn + oy * c;
    const P = (px, py) => [ctr[0] + px * c - py * sn, ctr[1] + px * sn + py * c];
    const g = { ctr: ctr, c: [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)], handles: {} };
    if (!l.locked) {
      g.handles.del = g.c[0]; g.handles.rot = g.c[1]; g.handles.scale = g.c[2];
      if (l.type === 'image' && hw > 46 && hh > 46) { g.handles.sx = P(hw, 0); g.handles.sy = P(0, hh); }
    }
    return g;
  };
  function disc(ctx, p, r) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  View.drawSelection = function (ctx) {
    const l = Doc.selected();
    if (!l || !l.visible) return;
    const g = this.selGeom(l);
    ctx.save();
    if (this.guides && this.guides.length) {
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.2;
      const a = this.toView(Doc.width / 2, Doc.height / 2);
      ctx.beginPath();
      if (this.guides.indexOf('v') >= 0) { ctx.moveTo(a[0], this.ty); ctx.lineTo(a[0], this.ty + Doc.height * this.scale); }
      if (this.guides.indexOf('h') >= 0) { ctx.moveTo(this.tx, a[1]); ctx.lineTo(this.tx + Doc.width * this.scale, a[1]); }
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(g.c[0][0], g.c[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(g.c[i][0], g.c[i][1]);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    if (l.locked) ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    const hd = g.handles;
    ctx.lineCap = 'round'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.9;
    if (hd.sx) for (const p of [hd.sx, hd.sy]) disc(ctx, p, 7);
    if (hd.del) {
      disc(ctx, hd.del, HANDLE_R);
      const p = hd.del, k = 4.4;
      ctx.beginPath(); ctx.moveTo(p[0] - k, p[1] - k); ctx.lineTo(p[0] + k, p[1] + k); ctx.moveTo(p[0] + k, p[1] - k); ctx.lineTo(p[0] - k, p[1] + k); ctx.stroke();
    }
    if (hd.rot) {
      disc(ctx, hd.rot, HANDLE_R);
      const p = hd.rot;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5.6, -0.4, 4.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0] + 2.2, p[1] - 6.4); ctx.lineTo(p[0] + 5.6, p[1] - 2.4); ctx.lineTo(p[0] + 8.2, p[1] - 6.6); ctx.stroke();
    }
    if (hd.scale) {
      disc(ctx, hd.scale, HANDLE_R);
      const p = hd.scale, a = l.rotation + Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a), k = 6, t = 3.4;
      ctx.beginPath();
      ctx.moveTo(p[0] - ux * k, p[1] - uy * k); ctx.lineTo(p[0] + ux * k, p[1] + uy * k);
      // arrow heads
      const head = (sx) => {
        const hx = p[0] + sx * ux * k, hy = p[1] + sx * uy * k;
        ctx.moveTo(hx - sx * ux * t - uy * t, hy - sx * uy * t + ux * t); ctx.lineTo(hx, hy); ctx.lineTo(hx - sx * ux * t + uy * t, hy - sx * uy * t - ux * t);
      };
      head(1); head(-1);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---------- pointer input ---------- */
  const P = new Map();            // active pointers: id -> [x, y] in view pixels
  let g = null;                   // current one-finger gesture
  let pinch = null;               // current two-finger gesture
  let lastTap = { t: 0, id: null };

  function pos(e) { const r = View.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function snapAngle(a) {
    const q = Math.PI / 4, m = Math.round(a / q) * q;
    return Math.abs(a - m) < 0.055 ? m : a;
  }
  function pickLayer(x, y) {
    const pad = 9 / View.scale;
    for (let i = Doc.layers.length - 1; i >= 0; i--) {
      const l = Doc.layers[i];
      if (!l.visible || l.locked) continue;
      if (Layers.hit(l, x, y, pad)) return l;
    }
    return null;
  }
  function hitHandle(l, p) {
    const hd = View.selGeom(l).handles;
    for (const k of ['del', 'rot', 'scale', 'sx', 'sy']) {
      const q = hd[k];
      if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) <= HANDLE_HIT) return k;
    }
    return null;
  }
  function limitScale(l) {
    const s = Layers.size(l), mn = 6, mx = Math.max(Doc.width, Doc.height) * 12;
    for (const k of ['scaleX', 'scaleY']) {
      const dim = k === 'scaleX' ? s.w : s.h;
      l[k] = U.clamp(l[k], mn / dim, mx / dim);
    }
  }

  function onDown(e) {
    if (!Doc.open) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { View.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = pos(e);
    P.set(e.pointerId, p);
    e.preventDefault();
    if (P.size === 2) {
      if (g && g.type === 'tool' && View.mode && View.mode.pointerCancel) View.mode.pointerCancel();
      g = null;
      startPinch();
      return;
    }
    if (P.size > 2) return;
    startSingle(p, e);
  }
  function startSingle(p, e) {
    const m = View.mode;
    if (m) {
      if (m.pointerDown) { g = { type: 'tool' }; m.pointerDown(p, e); }
      else g = { type: 'empty', start: p, moved: false, tx: View.tx, ty: View.ty };
      return;
    }
    const sel = Doc.selected();
    if (sel && sel.visible && !sel.locked) {
      const k = hitHandle(sel, p);
      if (k) {
        const c = View.toView(sel.x, sel.y), vx = p[0] - c[0], vy = p[1] - c[1];
        if (k === 'del') g = { type: 'del', layer: sel, start: p, moved: false };
        else if (k === 'rot') g = { type: 'rotate', layer: sel, c: c, a0: Math.atan2(vy, vx), r0: sel.rotation };
        else if (k === 'scale') g = { type: 'scale', layer: sel, c: c, d0: Math.hypot(vx, vy) || 1, sx0: sel.scaleX, sy0: sel.scaleY };
        else {
          const ax = k === 'sx' ? [Math.cos(sel.rotation), Math.sin(sel.rotation)] : [-Math.sin(sel.rotation), Math.cos(sel.rotation)];
          g = { type: 'stretch', layer: sel, c: c, ax: ax, key: k === 'sx' ? 'scaleX' : 'scaleY', d0: (vx * ax[0] + vy * ax[1]) || 1, s0: k === 'sx' ? sel.scaleX : sel.scaleY };
        }
        return;
      }
    }
    const d = View.toDoc(p[0], p[1]);
    const hit = pickLayer(d[0], d[1]);
    if (hit) {
      const was = hit.id === Doc.selectedId;
      if (!was) Doc.select(hit.id);
      g = { type: 'move', layer: hit, start: p, ox: hit.x, oy: hit.y, moved: false, was: was };
      View.request();
    } else {
      g = { type: 'empty', start: p, moved: false, tx: View.tx, ty: View.ty };
    }
  }
  function onMove(e) {
    if (!P.has(e.pointerId)) return;
    const p = pos(e);
    P.set(e.pointerId, p);
    if (pinch) { updatePinch(); return; }
    if (!g) return;
    const l = g.layer;
    switch (g.type) {
      case 'tool':
        if (View.mode && View.mode.pointerMove) View.mode.pointerMove(p, e);
        break;
      case 'move': {
        const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
        if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        g.moved = true;
        let nx = g.ox + dx / View.scale, ny = g.oy + dy / View.scale;
        /* a text (or the words of it) may not be dragged out of the picture */
        if (l.type === 'text') nx = Layers.allowedX(l, nx);
        const th = 6 / View.scale, guides = [];
        if (Math.abs(nx - Doc.width / 2) < th) { nx = Doc.width / 2; guides.push('v'); }
        if (Math.abs(ny - Doc.height / 2) < th) { ny = Doc.height / 2; guides.push('h'); }
        l.x = nx; l.y = ny;
        View.guides = guides; View.dirty = true; View.request();
        break;
      }
      case 'del':
        if (Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) > TAP_SLOP * 2) g.moved = true;
        break;
      case 'rotate':
        l.rotation = snapAngle(g.r0 + Math.atan2(p[1] - g.c[1], p[0] - g.c[0]) - g.a0);
        View.dirty = true; View.request();
        break;
      case 'scale': {
        const k = Math.max(0.02, Math.hypot(p[0] - g.c[0], p[1] - g.c[1]) / g.d0);
        l.scaleX = g.sx0 * k; l.scaleY = g.sy0 * k; limitScale(l);
        View.dirty = true; View.request();
        break;
      }
      case 'stretch': {
        const proj = (p[0] - g.c[0]) * g.ax[0] + (p[1] - g.c[1]) * g.ax[1];
        l[g.key] = g.s0 * Math.max(0.03, proj / g.d0); limitScale(l);
        View.dirty = true; View.request();
        break;
      }
      case 'empty': {
        const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
        if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        g.moved = true;
        if (View.scale > View.fitScale * 1.01) { View.tx = g.tx + dx; View.ty = g.ty + dy; View.clampPan(); View.request(); }
        break;
      }
    }
  }
  function onUp(e) {
    if (!P.has(e.pointerId)) return;
    const p = pos(e);
    P.delete(e.pointerId);
    try { View.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (pinch) {
      if (P.size < 2) endPinch();
      finish();
      return;
    }
    if (g) {
      const cur = g; g = null;
      switch (cur.type) {
        case 'tool':
          if (View.mode && View.mode.pointerUp) View.mode.pointerUp(p, e);
          break;
        case 'move':
          if (!cur.moved) {
            const now = performance.now();
            if (cur.was && cur.layer.type === 'text' && lastTap.id === cur.layer.id && now - lastTap.t < 420) { lastTap = { t: 0, id: null }; U.emit('edittext', cur.layer.id); }
            else lastTap = { t: now, id: cur.layer.id };
          }
          break;
        case 'del':
          if (!cur.moved) { Doc.remove(cur.layer.id); History.commit(); }
          break;
        case 'empty':
          if (!cur.moved) {
            if (View.mode) { if (View.mode.tap) View.mode.tap(p); }
            else if (Doc.selectedId) Doc.select(null);
            else U.emit('stagetap');
          }
          break;
      }
    }
    finish();
  }
  function finish() {
    if (P.size === 0) {
      View.guides = null;
      if (View.dirty) { View.dirty = false; if (!View.mode) History.commit(); }
    }
    View.request();
  }

  function pinchInfo() {
    const pts = Array.from(P.values()), a = pts[0], b = pts[1];
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function startPinch() {
    const i = pinchInfo();
    const sel = !View.mode ? Doc.selected() : null;
    if (sel && sel.visible && !sel.locked) pinch = { kind: 'layer', l: sel, i: i, x: sel.x, y: sel.y, sx: sel.scaleX, sy: sel.scaleY, rot: sel.rotation };
    else pinch = { kind: 'view', i: i, scale: View.scale, tx: View.tx, ty: View.ty };
  }
  function updatePinch() {
    if (P.size < 2) return;
    const i = pinchInfo(), o = pinch.i;
    if (pinch.kind === 'layer') {
      const l = pinch.l, k = i.dist / o.dist;
      l.scaleX = pinch.sx * k; l.scaleY = pinch.sy * k; limitScale(l);
      l.rotation = snapAngle(pinch.rot + (i.ang - o.ang));
      l.x = pinch.x + (i.mid[0] - o.mid[0]) / View.scale;
      l.y = pinch.y + (i.mid[1] - o.mid[1]) / View.scale;
      View.dirty = true;
    } else {
      const ns = U.clamp(pinch.scale * i.dist / o.dist, View.fitScale * 0.6, Math.max(View.fitScale * 16, 8));
      const dx = (o.mid[0] - pinch.tx) / pinch.scale, dy = (o.mid[1] - pinch.ty) / pinch.scale;
      View.scale = ns; View.tx = i.mid[0] - dx * ns; View.ty = i.mid[1] - dy * ns;
    }
    View.request();
  }
  function endPinch() {
    if (pinch && pinch.kind === 'view') { if (View.scale < View.fitScale) View.fit(View.pad); else View.clampPan(); }
    pinch = null;
    g = null;
  }
  function onWheel(e) {
    if (!Doc.open) return;
    e.preventDefault();
    const p = pos(e), k = Math.exp(-e.deltaY * 0.0016);
    const ns = U.clamp(View.scale * k, View.fitScale, Math.max(View.fitScale * 16, 8));
    const d = View.toDoc(p[0], p[1]);
    View.scale = ns; View.tx = p[0] - d[0] * ns; View.ty = p[1] - d[1] * ns;
    if (ns <= View.fitScale * 1.0001) View.fit(View.pad); else View.clampPan();
    View.request();
  }
  View.isZoomed = function () { return this.scale > this.fitScale * 1.01; };
})();
