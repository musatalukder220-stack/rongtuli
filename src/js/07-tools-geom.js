'use strict';
/* ============================================================
 * 07-tools-geom.js : Crop, Flip/Rotate, Resize
 * These change the whole canvas; every layer moves with it.
 * ============================================================ */
const CropTool = {};
const FlipRotateTool = {};
const ResizeTool = {};
(function () {
  const h = U.h;

  /* ============================ CROP ============================ */
  CropTool.open = function () {
    const W = Doc.width, H = Doc.height, MIN = Math.min(24, W, H);
    let r = { x: 0, y: 0, w: W, h: H };
    let aspect = null;          // width / height, or null = free
    let drag = null;
    const info = h('div', { class: 'crop-info' });
    const showInfo = () => { info.textContent = Math.round(r.w) + ' × ' + Math.round(r.h) + ' px'; };

    function setAspect(a) {
      aspect = a;
      if (!a) return;
      let w = W, hh = W / a;
      if (hh > H) { hh = H; w = H * a; }
      r = { x: (W - w) / 2, y: (H - hh) / 2, w: w, h: hh };
    }
    const RATIOS = [['free', 'Free'], ['orig', 'Original'], ['1:1', '1:1'], ['4:5', '4:5'], ['5:4', '5:4'], ['3:4', '3:4'], ['4:3', '4:3'],
      ['9:16', '9:16'], ['16:9', '16:9'], ['2:3', '2:3'], ['3:2', '3:2']];
    const chips = UI.chips(RATIOS, 'free', (v) => {
      if (v === 'free') aspect = null;
      else if (v === 'orig') setAspect(W / H);
      else { const p = v.split(':'); setAspect(+p[0] / +p[1]); }
      showInfo(); View.request();
    });

    /* which part of the frame is under the finger? returns {l,r,t,b} flags or 'move' */
    function hit(p) {
      const a = View.toView(r.x, r.y), b = View.toView(r.x + r.w, r.y + r.h), C = 26, Eg = 20;
      const nearL = Math.abs(p[0] - a[0]) < C, nearR = Math.abs(p[0] - b[0]) < C, nearT = Math.abs(p[1] - a[1]) < C, nearB = Math.abs(p[1] - b[1]) < C;
      const inX = p[0] > a[0] - Eg && p[0] < b[0] + Eg, inY = p[1] > a[1] - Eg && p[1] < b[1] + Eg;
      if ((nearL || nearR) && (nearT || nearB)) {
        // on a tiny frame both sides are "near": choose the closer one
        const left = nearL && (!nearR || Math.abs(p[0] - a[0]) <= Math.abs(p[0] - b[0]));
        const top = nearT && (!nearB || Math.abs(p[1] - a[1]) <= Math.abs(p[1] - b[1]));
        return { l: left, r: !left, t: top, b: !top };
      }
      if (inY && Math.abs(p[0] - a[0]) < Eg) return { l: true };
      if (inY && Math.abs(p[0] - b[0]) < Eg) return { r: true };
      if (inX && Math.abs(p[1] - a[1]) < Eg) return { t: true };
      if (inX && Math.abs(p[1] - b[1]) < Eg) return { b: true };
      if (p[0] > a[0] && p[0] < b[0] && p[1] > a[1] && p[1] < b[1]) return 'move';
      return null;
    }
    function resize(k, d, o) {
      const corner = (k.l || k.r) && (k.t || k.b);
      if (!aspect) {
        let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
        if (k.l) x0 = U.clamp(d[0], 0, x1 - MIN);
        if (k.r) x1 = U.clamp(d[0], x0 + MIN, W);
        if (k.t) y0 = U.clamp(d[1], 0, y1 - MIN);
        if (k.b) y1 = U.clamp(d[1], y0 + MIN, H);
        r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        return;
      }
      if (corner) {
        const ax = k.l ? o.x + o.w : o.x, ay = k.t ? o.y + o.h : o.y;        // the corner that stays put
        const maxW = k.l ? ax : W - ax, maxH = k.t ? ay : H - ay;
        let w = Math.max(Math.abs(d[0] - ax), Math.abs(d[1] - ay) * aspect);
        w = Math.min(w, maxW, maxH * aspect);
        w = Math.max(w, Math.min(MIN * Math.max(1, aspect), maxW, maxH * aspect));
        const hh = w / aspect;
        r = { x: k.l ? ax - w : ax, y: k.t ? ay - hh : ay, w: w, h: hh };
      } else if (k.l || k.r) {
        const ax = k.l ? o.x + o.w : o.x, cy = o.y + o.h / 2;
        const maxW = Math.min(k.l ? ax : W - ax, 2 * Math.min(cy, H - cy) * aspect);
        const w = U.clamp(Math.abs(d[0] - ax), Math.min(MIN, maxW), maxW), hh = w / aspect;
        r = { x: k.l ? ax - w : ax, y: cy - hh / 2, w: w, h: hh };
      } else {
        const ay = k.t ? o.y + o.h : o.y, cx = o.x + o.w / 2;
        const maxH = Math.min(k.t ? ay : H - ay, 2 * Math.min(cx, W - cx) / aspect);
        const hh = U.clamp(Math.abs(d[1] - ay), Math.min(MIN, maxH), maxH), w = hh * aspect;
        r = { x: cx - w / 2, y: k.t ? ay - hh : ay, w: w, h: hh };
      }
    }

    const m = {
      title: 'Crop',
      panel: h('div', { class: 'panel-pad' }, info, chips),
      pointerDown: (p) => {
        const k = hit(p);
        drag = k ? { k: k, start: View.toDoc(p[0], p[1]), o: Object.assign({}, r) } : null;
      },
      pointerMove: (p) => {
        if (!drag) return;
        const d = View.toDoc(p[0], p[1]);
        if (drag.k === 'move') {
          r.x = U.clamp(drag.o.x + d[0] - drag.start[0], 0, W - r.w);
          r.y = U.clamp(drag.o.y + d[1] - drag.start[1], 0, H - r.h);
        } else resize(drag.k, d, drag.o);
        showInfo(); View.request();
      },
      pointerUp: () => { drag = null; },
      pointerCancel: () => { if (drag) { r = drag.o; drag = null; showInfo(); View.request(); } },
      overlay: (ctx, v) => {
        const a = v.toView(r.x, r.y), b = v.toView(r.x + r.w, r.y + r.h), o = v.toView(0, 0), e = v.toView(W, H);
        const x0 = a[0], y0 = a[1], x1 = b[0], y1 = b[1];
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.62)';
        ctx.fillRect(o[0], o[1], e[0] - o[0], y0 - o[1]);
        ctx.fillRect(o[0], y1, e[0] - o[0], e[1] - y1);
        ctx.fillRect(o[0], y0, x0 - o[0], y1 - y0);
        ctx.fillRect(x1, y0, e[0] - x1, y1 - y0);
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          const gx = x0 + (x1 - x0) * i / 3, gy = y0 + (y1 - y0) * i / 3;
          ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy);
        }
        ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        // corner brackets + side bars
        const L = Math.min(22, (x1 - x0) / 3, (y1 - y0) / 3), t = 4;
        ctx.lineWidth = t; ctx.lineCap = 'square';
        ctx.beginPath();
        for (const c of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
          const cx = c[0] - c[2] * t / 2, cy = c[1] - c[3] * t / 2;
          ctx.moveTo(cx + c[2] * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + c[3] * L);
        }
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, B = Math.min(13, (x1 - x0) / 6, (y1 - y0) / 6);
        ctx.moveTo(mx - B, y0 - t / 2); ctx.lineTo(mx + B, y0 - t / 2); ctx.moveTo(mx - B, y1 + t / 2); ctx.lineTo(mx + B, y1 + t / 2);
        ctx.moveTo(x0 - t / 2, my - B); ctx.lineTo(x0 - t / 2, my + B); ctx.moveTo(x1 + t / 2, my - B); ctx.lineTo(x1 + t / 2, my + B);
        ctx.stroke();
        ctx.restore();
      },
      apply: () => {
        const x = U.clamp(Math.round(r.x), 0, W - 1), y = U.clamp(Math.round(r.y), 0, H - 1);
        const w = U.clamp(Math.round(r.w), 1, W - x), hh = U.clamp(Math.round(r.h), 1, H - y);
        if (x === 0 && y === 0 && w === W && hh === H) { View.fit(14); return; }
        Doc.transform([{ t: 'translate', dx: -x, dy: -y }], w, hh);
        History.commit();
        View.fit(14);
      },
      cancel: () => { View.fit(14); }
    };
    Doc.select(null);
    showInfo();
    UI.enterMode(m);
    View.fit(28);
  };

  /* ============================ FLIP / ROTATE ============================ */
  FlipRotateTool.open = function () {
    const st = { ops: [], w: Doc.width, h: Doc.height, angle: 0 };     // angle in degrees (straighten)
    Doc.select(null);
    const pv = Doc.flatten({ maxDim: 1400, bg: false });
    function allOps() {
      const ops = st.ops.slice();
      if (st.angle) {
        const a = st.angle * Math.PI / 180, s = Math.abs(Math.sin(a)), c = Math.cos(a);
        const k = c + Math.max(st.h / st.w, st.w / st.h) * s;          // zoom so that no empty corners show
        ops.push({ t: 'rotate', a: a, cx: st.w / 2, cy: st.h / 2 }, { t: 'translate', dx: -st.w / 2, dy: -st.h / 2 }, { t: 'scale', k: k }, { t: 'translate', dx: st.w / 2, dy: st.h / 2 });
      }
      return ops;
    }
    const act = {
      rotL: () => { st.ops.push({ t: 'rotate', a: -Math.PI / 2, cx: 0, cy: 0 }, { t: 'translate', dx: 0, dy: st.w }); const t = st.w; st.w = st.h; st.h = t; },
      rotR: () => { st.ops.push({ t: 'rotate', a: Math.PI / 2, cx: 0, cy: 0 }, { t: 'translate', dx: st.h, dy: 0 }); const t = st.w; st.w = st.h; st.h = t; },
      flipH: () => { st.ops.push({ t: 'flipH', w: st.w }); },
      flipV: () => { st.ops.push({ t: 'flipV', h: st.h }); }
    };
    const item = (id, icon, label) => ({ id: id, icon: icon, label: label, onTap: () => { act[id](); View.request(); } });
    const slider = UI.slider({ label: 'Straighten', min: -45, max: 45, step: 0.5, value: 0, resetTo: 0, fmt: (v) => (Math.round(v * 10) / 10) + '°', onInput: (v) => { st.angle = v; View.request(); } });
    const m = {
      title: 'Flip/Rotate',
      panel: h('div', { class: 'panel-pad' }, slider),
      items: [item('rotL', 'rotL', 'Left'), item('rotR', 'rotR', 'Right'), item('flipH', 'flipH', 'Flip H'), item('flipV', 'flipV', 'Flip V'),
        { id: 'reset', icon: 'reset', label: 'Reset', onTap: () => { st.ops = []; st.w = Doc.width; st.h = Doc.height; st.angle = 0; slider.set(0); View.request(); } }],
      render: (ctx, v) => {
        const p = 22, s = Math.min((v.w - 2 * p) / st.w, (v.h - 2 * p) / st.h), ox = (v.w - st.w * s) / 2, oy = (v.h - st.h * s) / 2;
        ctx.save();
        ctx.beginPath(); ctx.rect(ox, oy, st.w * s, st.h * s); ctx.clip();
        ctx.fillStyle = Doc.bg.type === 'color' ? Doc.bg.color : v.checker(ctx);
        ctx.fillRect(ox, oy, st.w * s, st.h * s);
        ctx.translate(ox, oy); ctx.scale(s, s);
        const M = Doc.matrix(allOps());
        ctx.transform(M.a, M.b, M.c, M.d, M.e, M.f);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(pv, 0, 0, Doc.width, Doc.height);
        ctx.restore();
        if (st.angle) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let i = 1; i < 6; i++) {
            const gx = ox + st.w * s * i / 6, gy = oy + st.h * s * i / 6;
            ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + st.h * s); ctx.moveTo(ox, gy); ctx.lineTo(ox + st.w * s, gy);
          }
          ctx.stroke(); ctx.restore();
        }
      },
      apply: async () => {
        const ops = allOps();
        if (!ops.length) return;
        await U.busy(() => { Doc.transform(ops, st.w, st.h); History.commit(); }, 'Applying…');
        View.fit(14);
      }
    };
    UI.enterMode(m);
  };

  /* ============================ RESIZE ============================ */
  ResizeTool.open = function () {
    const W = Doc.width, H = Doc.height, MAX_SIDE = 4096, MAX_PIX = 12e6;
    let lock = true;
    const num = (v) => h('input', { type: 'number', inputmode: 'numeric', min: 16, max: MAX_SIDE, value: v });
    const wi = num(W), hi = num(H);
    const note = h('p', { class: 'panel-note', text: 'Now: ' + W + ' × ' + H + ' px' });
    wi.addEventListener('input', () => { if (lock && +wi.value > 0) hi.value = Math.max(1, Math.round(+wi.value * H / W)); });
    hi.addEventListener('input', () => { if (lock && +hi.value > 0) wi.value = Math.max(1, Math.round(+hi.value * W / H)); });
    const lockChips = UI.chips([['1', 'Keep proportions'], ['0', 'Free']], '1', (v) => { lock = v === '1'; if (lock) hi.value = Math.max(1, Math.round(+wi.value * H / W)); });
    const pct = h('div', { class: 'chips' });
    for (const p of [25, 50, 75, 150, 200]) {
      const b = h('button', { class: 'chip', type: 'button', text: p + '%' });
      U.onTap(b, () => { wi.value = Math.round(W * p / 100); hi.value = Math.round(H * p / 100); });
      pct.appendChild(b);
    }
    const go = h('button', { class: 'btn pri wide', type: 'button', text: 'Resize', id: 'btn-resize' });
    const sh = UI.sheet('Resize', h('div', null, note,
      h('div', { class: 'field' }, h('label', { text: 'Width' }), wi), h('div', { class: 'field' }, h('label', { text: 'Height' }), hi), lockChips, pct, go));
    U.onTap(go, async () => {
      const nw = Math.round(+wi.value), nh = Math.round(+hi.value);
      if (!(nw >= 16 && nh >= 16)) { U.toast('The smallest size is 16 px'); return; }
      if (nw > MAX_SIDE || nh > MAX_SIDE || nw * nh > MAX_PIX) { U.toast('Too big for a phone browser. Largest side ' + MAX_SIDE + ' px, 12 megapixels in total'); return; }
      sh.close();
      if (nw === W && nh === H) return;
      const kx = nw / W, ky = nh / H;
      await U.busy(() => { Doc.select(null); Doc.transform([{ t: 'scale', k: Math.sqrt(kx * ky), kx: kx, ky: ky }], nw, nh); History.commit(); }, 'Resizing…');
      View.fit(14);
      U.toast('Resized to ' + nw + ' × ' + nh);
    });
  };
})();
