'use strict';
/* ============================================================
 * 04-doc.js : the document = a canvas size + a stack of layers,
 * text drawing, and undo/redo history.
 *
 * Rule that keeps undo cheap: a layer's bitmap is never drawn
 * into after it is created. Editing makes a NEW canvas, so old
 * history states can keep pointing at the old one.
 * ============================================================ */
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Dodge'], ['color-burn', 'Burn'],
  ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
  ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];

const Layers = {};
const TextRender = {};
const Doc = {};
Doc._ver = 0;      // goes up with every change; the saved picture is kept against it (11-export.js)
const History = {};

(function () {
  /* ---------------- layers ---------------- */
  const COMMON = () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false, opacity: 1, blend: 'source-over', visible: true, locked: false });

  Layers.image = function (bitmap, p) {
    return Object.assign({ id: U.uid(), type: 'image', name: 'Photo', bitmap: bitmap, base: false }, COMMON(), p || {});
  };
  /* sizes inside a text layer (stroke, shadow, spacing, padding) are in % of the font size */
  Layers.text = function (text, p) {
    return Object.assign({
      id: U.uid(), type: 'text', name: 'Text', text: text, font: 'sans-serif', size: 100, bold: false, italic: false,
      color: '#ffffff', align: 'center', letterSpacing: 0, lineHeight: 1.25, bend: 0, arc: 0, slant: 0, nudge: 0,   // nudge: % of the picture's width, see 09-objects.js
      stroke: { on: false, color: '#000000', width: 6 },
      shadow: { on: false, color: '#000000', blur: 10, dx: 4, dy: 4, opacity: 0.6 },
      bg: { on: false, color: '#000000', opacity: 0.6, pad: 22, radius: 30 },      // optional pl / pr / pt / pb: padding per side
      spans: null,          // parts of the text with their own colour / font (see TextRender.pieces)
      grad: null            // gradient fill instead of one colour (see Layers.gradient)
    }, COMMON(), p || {});
  };
  /* copy of plain values, lists and objects (pictures are shared, never copied) */
  function deep(v) {
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object' && !(v instanceof HTMLCanvasElement)) { const o = {}; for (const k in v) o[k] = deep(v[k]); return o; }
    return v;
  }
  Layers.clone = function (l) {
    const o = {};
    for (const k in l) o[k] = (k === '_cache' || k === 'bitmap') ? l[k] : deep(l[k]);
    return o;
  };
  Layers.touch = function (l) { l._cache = null; Doc._ver++; };
  Layers.size = function (l) {
    if (l.type === 'image') return { w: l.bitmap.width, h: l.bitmap.height };
    const c = TextRender.ensure(l);
    return { w: c.w, h: c.h };
  };
  /* corners of the layer box in document coordinates: TL, TR, BR, BL */
  Layers.corners = function (l) {
    const s = Layers.size(l), hw = s.w * l.scaleX / 2, hh = s.h * l.scaleY / 2, c = Math.cos(l.rotation), sn = Math.sin(l.rotation);
    const cx = TextRender.baseX ? TextRender.baseX(l) : l.x;      // (a nudged text: the box goes with the words)
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map((p) => [cx + p[0] * c - p[1] * sn, l.y + p[0] * sn + p[1] * c]);
  };
  /* a small map of where a picture is see-through (made once per picture) */
  const alphaMaps = new WeakMap();
  function alphaMap(bitmap) {
    let m = alphaMaps.get(bitmap);
    if (!m) {
      const k = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height)), w = Math.max(1, Math.round(bitmap.width * k)), hh = Math.max(1, Math.round(bitmap.height * k));
      const c = U.canvas(w, hh), x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(bitmap, 0, 0, w, hh);
      const d = x.getImageData(0, 0, w, hh).data, a = new Uint8Array(w * hh);
      let some = false, all = true;
      for (let i = 0; i < a.length; i++) { a[i] = d[i * 4 + 3]; if (a[i] > 20) some = true; else all = false; }
      m = { w: w, h: hh, a: a, solid: all, empty: !some };
      alphaMaps.set(bitmap, m);
    }
    return m;
  }
  /* is the point (document px) on the layer? For pictures the see-through parts do not count,
     so a frame with a hole or a cut-out does not swallow taps meant for what is behind it. */
  Layers.hit = function (l, x, y, pad) {
    const s = Layers.size(l), dx = x - l.x, dy = y - l.y, c = Math.cos(-l.rotation), sn = Math.sin(-l.rotation);
    const lx = dx * c - dy * sn, ly = dx * sn + dy * c, bw = s.w * Math.abs(l.scaleX), bh = s.h * Math.abs(l.scaleY);
    if (!(Math.abs(lx) <= bw / 2 + pad && Math.abs(ly) <= bh / 2 + pad)) return false;
    if (l.type !== 'image') return true;
    const m = alphaMap(l.bitmap);
    if (m.solid || m.empty) return true;
    const u = Math.floor((lx / bw * (l.flipH ? -1 : 1) + 0.5) * m.w), v = Math.floor((ly / bh * (l.flipV ? -1 : 1) + 0.5) * m.h);
    const rx = U.clamp(Math.ceil(pad / bw * m.w), 1, 5), ry = U.clamp(Math.ceil(pad / bh * m.h), 1, 5);
    for (let j = Math.max(0, v - ry); j <= Math.min(m.h - 1, v + ry); j++) {
      const row = j * m.w;
      for (let i = Math.max(0, u - rx); i <= Math.min(m.w - 1, u + rx); i++) if (m.a[row + i] > 20) return true;
    }
    return false;
  };
  /* draw the layer's pixels with its own transform (no opacity / blend) */
  Layers.drawRaw = function (ctx, l, bitmapOverride) {
    /* a nudged text: the words and their selection box move together (TextRender.baseX) */
    ctx.translate(l.type === 'text' && TextRender.baseX ? TextRender.baseX(l) : l.x, l.y);
    if (l.rotation) ctx.rotate(l.rotation);
    ctx.scale(l.scaleX * (l.flipH ? -1 : 1), l.scaleY * (l.flipV ? -1 : 1));
    if (l.type === 'image') {
      const w = l.bitmap.width, h = l.bitmap.height;
      ctx.drawImage(bitmapOverride || l.bitmap, -w / 2, -h / 2, w, h);
      if (l.outline && l.outline.color && l.outline.width > 0) {
        // a line around the picture; its thickness is kept the same on the canvas whatever the picture's size
        const k = Math.max(0.02, (Math.abs(l.scaleX) + Math.abs(l.scaleY)) / 2);
        ctx.strokeStyle = l.outline.color; ctx.lineWidth = l.outline.width / k; ctx.lineJoin = 'round';
        ctx.strokeRect(-w / 2, -h / 2, w, h);
      }
    } else {
      const c = TextRender.ensure(l);
      ctx.drawImage(c.canvas, -c.w / 2 - c.M, -c.h / 2 - c.M, c.w + 2 * c.M, c.h + 2 * c.M);
    }
  };
  Layers.draw = function (ctx, l, bitmapOverride) {
    if (!l.visible || l.opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation = l.blend || 'source-over';
    Layers.drawRaw(ctx, l, bitmapOverride);
    ctx.restore();
  };
  Layers.thumb = function (l, size) {
    const c = U.canvas(size, size), x = c.getContext('2d'), s = Layers.size(l), k = Math.min(size / s.w, size / s.h);
    x.translate(size / 2, size / 2); x.scale(k, k);
    if (l.type === 'image') x.drawImage(l.bitmap, -s.w / 2, -s.h / 2);
    else { const t = TextRender.ensure(l); x.drawImage(t.canvas, -t.w / 2 - t.M, -t.h / 2 - t.M, t.w + 2 * t.M, t.h + 2 * t.M); }
    return c;
  };

  /* ---------------- text ---------------- */
  const mc = U.canvas(4, 4).getContext('2d');
  const hasLS = 'letterSpacing' in mc;
  let seg = null;
  try { seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { seg = null; }
  const JOINER_END = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D\u0DCA\u200D]$/;      // virama / ZWJ: next letter belongs to the same cluster
  const MARK_START = /^[\u0300-\u036F\u0900-\u0903\u093A-\u094F\u0981-\u0983\u09BC-\u09CD\u09D7\u200C\u200D\uFE0F]/;
  /* split a line into pieces that must be drawn together (Bangla conjuncts stay whole) */
  function clusters(str) {
    const parts = seg ? Array.from(seg.segment(str), (s) => s.segment) : Array.from(str);
    const out = [];
    for (const p of parts) {
      const prev = out.length ? out[out.length - 1] : null;
      if (prev !== null && (JOINER_END.test(prev) || (!seg && MARK_START.test(p)))) out[out.length - 1] = prev + p;
      else out.push(p);
    }
    return out;
  }
  const styleOf = (l) => ({ font: l.font, bold: !!l.bold, italic: !!l.italic, color: l.color });
  const fontStr = (st, px) => (st.italic ? 'italic ' : '') + (st.bold ? 'bold ' : '') + px + 'px ' + Fonts.css(st.font);
  const quant = (s) => Math.pow(2, Math.ceil(Math.log2(Math.max(s, 0.02)) * 4) / 4);   // 8 steps per doubling: crisp letters at any size
  const SPAN_KEYS = ['color', 'font', 'bold', 'italic'];

  /* A text layer may carry l.spans = [{s, e, color?, font?, bold?, italic?}]: parts of the text (from index s up to, not
     including, e) that look different from the rest. Later entries win. This cuts the text into pieces of one look each. */
  TextRender.pieces = function (l) {
    const n = String(l.text == null ? '' : l.text).length, base = styleOf(l), sp = l.spans;
    if (!sp || !sp.length) return [{ s: 0, e: n, st: base }];
    const cuts = new Set([0, n]);
    for (const q of sp) { cuts.add(U.clamp(q.s | 0, 0, n)); cuts.add(U.clamp(q.e | 0, 0, n)); }
    const pts = Array.from(cuts).sort((a, b) => a - b), out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i], e = pts[i + 1], st = Object.assign({}, base);
      for (const q of sp) if (q.s <= s && q.e >= e) for (const k of SPAN_KEYS) if (q[k] != null) st[k] = q[k];
      const prev = out[out.length - 1];
      if (prev && SPAN_KEYS.every((k) => prev.st[k] === st[k])) prev.e = e;
      else out.push({ s: s, e: e, st: st });
    }
    return out.length ? out : [{ s: 0, e: n, st: base }];
  };
  /* after the text was edited: keep the styled parts where they belong (looks at the unchanged start and end) */
  TextRender.editSpans = function (spans, oldT, newT) {
    if (!spans || !spans.length) return null;
    const ol = oldT.length, nl = newT.length;
    let a = 0, b = 0;
    while (a < ol && a < nl && oldT.charCodeAt(a) === newT.charCodeAt(a)) a++;
    while (b < ol - a && b < nl - a && oldT.charCodeAt(ol - 1 - b) === newT.charCodeAt(nl - 1 - b)) b++;
    const oe = ol - b, d = nl - ol;
    const map = (i, end) => (i <= a ? i : i >= oe ? i + d : end ? nl - b : a);
    const out = [];
    for (const q of spans) {
      const s = map(q.s, false), e = map(q.e, true);
      if (e > s) out.push(Object.assign({}, q, { s: s, e: e }));
    }
    return out.length ? out : null;
  };
  /* change the colour / font / bold / italic of the whole text (parts with their own look give it up) */
  Layers.setTextStyle = function (l, key, value) {
    l[key] = value;
    if (l.spans) {
      const out = [];
      for (const q of l.spans) { const c = Object.assign({}, q); delete c[key]; if (SPAN_KEYS.some((k) => c[k] != null)) out.push(c); }
      l.spans = out.length ? out : null;
    }
    if (key === 'color') l.grad = null;
    l._cache = null;
  };

  TextRender.layout = function (l) {
    const size = l.size, text = String(l.text == null ? '' : l.text);
    const pcs = TextRender.pieces(l);
    const ls = (l.letterSpacing || 0) * size / 100;
    const lineH = size * (l.lineHeight || 1.25);
    const bend = l.bend || 0;
    const slant = (l.slant || 0) * 0.01;          // sideways lean: + leans right (italic), - leans left
    const manual = bend !== 0 || (ls !== 0 && !hasLS);
    const mets = new Map();
    const met = (st) => {
      const f = fontStr(st, size);
      let m = mets.get(f);
      if (!m) {
        mc.font = f; if (hasLS) mc.letterSpacing = '0px';
        const fm = mc.measureText('Mg');
        m = { f: f, asc: fm.fontBoundingBoxAscent || size * 0.95, desc: fm.fontBoundingBoxDescent || size * 0.3 };
        mets.set(f, m);
      }
      return m;
    };
    /* width of text[s, e) (several looks are measured one after the other) */
    const span = (s, e) => {
      let wsum = 0;
      for (const p of pcs) {
        const s2 = Math.max(p.s, s), e2 = Math.min(p.e, e);
        if (e2 <= s2) continue;
        const sub = text.slice(s2, e2);
        mc.font = met(p.st).f;
        if (hasLS) { mc.letterSpacing = ls + 'px'; wsum += mc.measureText(sub).width; }
        else wsum += mc.measureText(sub).width + ls * clusters(sub).length;
      }
      return Math.max(0, wsum - (e > s ? ls : 0));
    };
    /* the lines to draw, as [from, to) in the text. l.wrap (px at scale 1) breaks long lines between words */
    const wrapW = !bend && l.wrap > 0 ? l.wrap : 0;
    const ranges = [];
    let pos = 0;
    for (const str of text.split('\n')) {
      const a = pos, b = pos + str.length;
      pos = b + 1;
      if (!wrapW || !str.length) { ranges.push([a, b]); continue; }
      const re = /\S+\s*/g; let m, start = -1, end = a;       // start..end = the line being filled (end = after its last word)
      re.lastIndex = 0;
      const lead = str.match(/^\s*/)[0].length;
      while ((m = re.exec(str))) {
        const ws = a + m.index, we = ws + m[0].replace(/\s+$/, '').length;
        if (start < 0) { start = a + (m.index === lead ? 0 : m.index); end = we; }
        else if (span(start, we) > wrapW + 0.01) { ranges.push([start, end]); start = ws; end = we; }
        else { end = we; continue; }
        // a single word wider than the line: cut it where it stops fitting (never inside a Bangla conjunct)
        while (span(start, end) > wrapW + 0.01) {
          const cl = clusters(text.slice(start, end));
          if (cl.length < 2) break;
          let lo = 1, hi = cl.length - 1;                    // number of pieces kept on this line
          const upTo = (cnt) => { let q = start; for (let i = 0; i < cnt; i++) q += cl[i].length; return q; };
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (span(start, upTo(mid)) <= wrapW + 0.01) lo = mid; else hi = mid - 1; }
          const cut = upTo(lo);
          ranges.push([start, cut]); start = cut;
        }
      }
      ranges.push(start < 0 ? [a, b] : [start, end]);
    }
    const wrapped = ranges.length > text.split('\n').length;
    const lines = [];
    let nat = 0;
    for (const rg of ranges) {
      const a = rg[0], b = rg[1];
      const ln = { runs: [], w: 0, asc: 0, desc: 0 };
      let x = 0, any = false;
      for (const p of pcs) {
        const s = Math.max(p.s, a), e = Math.min(p.e, b);
        if (e <= s) continue;
        const sub = text.slice(s, e), m = met(p.st);
        mc.font = m.f;
        if (m.asc > ln.asc) ln.asc = m.asc;
        if (m.desc > ln.desc) ln.desc = m.desc;
        any = true;
        if (manual) {
          if (hasLS) mc.letterSpacing = '0px';
          for (const c of clusters(sub)) { const w = mc.measureText(c).width; ln.runs.push({ s: c, x: x, w: w, f: m.f, c: p.st.color }); x += w + ls; }
        } else {
          if (hasLS) mc.letterSpacing = ls + 'px';
          const w = mc.measureText(sub).width;
          ln.runs.push({ s: sub, x: x, w: w, f: m.f, c: p.st.color });
          x += w;
        }
      }
      if (!any) {                                   // empty line: still as tall as the text around it
        let st = pcs[0].st;
        for (const p of pcs) if (p.s <= a && p.e >= a) { st = p.st; break; }
        const m = met(st); ln.asc = m.asc; ln.desc = m.desc;
      }
      ln.w = Math.max(0, x - (any ? ls : 0));
      if (ln.asc + ln.desc > nat) nat = ln.asc + ln.desc;
      lines.push(ln);
    }
    if (hasLS) mc.letterSpacing = '0px';
    const tw = Math.max(1, Math.max.apply(null, lines.map((q) => q.w)));      // the box is as wide as the longest line (also when wrapped)
    const n = lines.length;
    const cmds = [];           // {s, x, y, rot, dx, f, c}
    let w, h, box, tailH = 0, bub = null;
    if (!bend) {
      const bg = l.bg, padOf = (k) => (bg.on ? (bg[k] != null ? bg[k] : bg.pad) * size / 100 : 0);
      let pl = padOf('pl'), pr = padOf('pr'), pt = padOf('pt'), pb = padOf('pb');
      /* a gap on every side, so the box drawn round the words is a box the words fit in (never on the edge).
         Only for text typed in the app: a PixelLab project keeps its exact place and look. */
      const GAP = l.gap ? size * 0.16 : 0;
      pl += GAP; pr += GAP; pt += GAP * 0.75; pb += GAP * 0.6;
      if (l.bubble) {
        // a speech bubble: room around the words (more for the round kinds, the words must stay inside the curve) and a tail below
        const th = n * lineH, curved = l.bubble.kind === 'oval' || l.bubble.kind === 'cloud' || l.bubble.kind === 'shout' || l.bubble.kind === 'heart';
        pl = pr = curved ? tw * 0.23 + size * 0.4 : size * 0.6;
        pt = pb = curved ? th * 0.23 + size * 0.34 : size * 0.4;
        tailH = l.bubble.tail === 'none' ? 0 : size * (l.bubble.kind === 'cloud' ? 0.95 : 0.8);
      }
      for (let i = 0; i < n; i++) {
        const ln = lines[i];
        const x0 = l.align === 'left' ? 0 : l.align === 'right' ? tw - ln.w : (tw - ln.w) / 2;
        const y = i * lineH + (lineH - (ln.asc + ln.desc)) / 2 + ln.asc;
        for (const r of ln.runs) cmds.push({ s: r.s, x: pl + x0 + r.x, y: pt + y, rot: 0, dx: 0, f: r.f, c: r.c });
      }
      w = Math.max(1, tw + pl + pr + Math.abs(slant) * (pt + n * lineH)); h = Math.max(1, n * lineH + pt + pb + tailH);
      if (slant) for (const c of cmds) { c.sk = slant; c.y -= pt; if (slant > 0) c.x += slant * n * lineH; }   // the lean starts at the foot of the last line
      box = [pl, pt, tw, n * lineH];
      if (l.bubble) bub = { w: w, h: h - tailH, tail: tailH };
    } else {
      // text on a circle. Positive bend = arch (circle centre below), negative = smile (centre above).
      // l.arc (0..100) makes the circle bigger instead of the bend: 0 = none, 100 = the tightest circle.
      // The same bend on a longer line gives a bigger circle by itself, so a long line stays readable.
      const TH = bend / 100 * 5.2, arc = U.clamp(l.arc || 0, 0, 100);
      /* (a tight circle: its radius can be smaller than the line is long) */
      const R = arc > 0 ? tw / Math.max(0.2, arc / 100 * 1.9) : tw / Math.abs(TH), dir = bend > 0 ? 1 : -1;
      /* Arc: how much of the circle the words cover (a small circle = a tight ring). 0 keeps the old, gentle bend. */
      const span0 = arc > 0 ? arc / 100 * 2.2 : 0;                    // half the angle, in radians
      const rEff = arc > 0 ? tw / (2 * Math.sin(Math.min(1.5, span0))) : R;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const ln = lines[i], off = ((n - 1) / 2 - i) * lineH, Ri = Math.max(size * 0.4, rEff + dir * off);
        for (const r of ln.runs) {
          const s = r.x + r.w / 2 - ln.w / 2, phi = arc > 0 ? (s / tw) * span0 * 2 : s / Ri;
          const RR = arc > 0 ? rEff : R;
          const cx = Ri * Math.sin(phi), cy = dir > 0 ? RR - Ri * Math.cos(phi) : -RR + Ri * Math.cos(phi), rot = dir > 0 ? phi : -phi;
          cmds.push({ s: r.s, x: cx, y: cy, rot: rot, dx: -r.w / 2, f: r.f, c: r.c, sk: slant });
          const c = Math.cos(rot), sn = Math.sin(rot);
          for (const p of [[-r.w / 2, -ln.asc], [r.w / 2, -ln.asc], [r.w / 2, ln.desc], [-r.w / 2, ln.desc]]) {
            const px = cx + p[0] * c - p[1] * sn, py = cy + p[0] * sn + p[1] * c;
            if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
          }
        }
      }
      if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 1; y1 = lineH; }
      if (slant) x1 = x1 + Math.abs(slant) * lineH;   // a leaning word reaches a little further out
      for (const c of cmds) { c.x -= x0; c.y -= y0; }
      w = Math.max(1, x1 - x0); h = Math.max(1, y1 - y0);
      box = [0, 0, w, h];
    }
    const sw = l.stroke.on ? l.stroke.width * size / 100 : 0;
    const shExt = l.shadow.on ? (l.shadow.blur * 2 + Math.max(Math.abs(l.shadow.dx), Math.abs(l.shadow.dy))) * size / 100 : 0;
    return { w: w, h: h, M: Math.ceil(size * 0.3 + sw + shExt), cmds: cmds, ls: manual ? 0 : ls, sw: sw, box: box, lines: lines, lineH: lineH, tw: tw, nat: nat, wrapped: wrapped, bub: bub };
  };
  /* height of one line of this text as the font itself asks for (px at scale 1) */
  TextRender.natural = (l) => TextRender.layout(l).nat;
  /* how far one look { font, bold, italic } reaches above and below the baseline at this size, as the browser sees it */
  TextRender.fontBox = function (st, size) {
    mc.font = fontStr(st, size); if (hasLS) mc.letterSpacing = '0px';
    const fm = mc.measureText('Mg');
    return { asc: fm.fontBoundingBoxAscent || size * 0.95, desc: fm.fontBoundingBoxDescent || size * 0.3 };
  };

  /* the bubble of a callout. b = layer.bubble { kind: round | box | oval | cloud | shout, fill, line, lw (% of the font size), tail: left | right | none },
     g = { w, h (of the bubble body), tail (height of the tail below it) }. Outline first, fill on top: the joins disappear. */
  function drawBubble(x, b, g, size) {
    const W = g.w, H = g.h, T = g.tail, lw = Math.max(0, b.lw == null ? 5 : b.lw) * size / 100, parts = [];
    const curved = b.kind === 'oval' || b.kind === 'cloud' || b.kind === 'shout' || b.kind === 'heart';
    const body = new Path2D();
    if (b.kind === 'oval') body.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, 6.2832);
    else if (b.kind === 'box') body.rect(0, 0, W, H);
    else if (b.kind === 'cloud') {
      const per = Math.PI * (W + H) / 2, n = Math.max(8, Math.round(per / (size * 1.25))), r = per / n * 0.66;
      for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + 0.3; const p = new Path2D(); p.arc(W / 2 + (W / 2 - r) * Math.cos(a), H / 2 + (H / 2 - r) * Math.sin(a), r, 0, 6.2832); parts.push(p); }
      body.ellipse(W / 2, H / 2, Math.max(1, W / 2 - r * 0.7), Math.max(1, H / 2 - r * 0.7), 0, 0, 6.2832);
    } else if (b.kind === 'heart') {
      const w = W, hh = H, top = hh * 0.28;
      body.moveTo(w / 2, hh);
      body.bezierCurveTo(w * 0.06, hh * 0.72, 0, hh * 0.42, 0, hh * 0.3);
      body.bezierCurveTo(0, hh * 0.04, w * 0.18, 0, w * 0.3, 0);
      body.bezierCurveTo(w * 0.42, 0, w * 0.47, hh * 0.08, w / 2, hh * 0.16);
      body.bezierCurveTo(w * 0.53, hh * 0.08, w * 0.58, 0, w * 0.7, 0);
      body.bezierCurveTo(w * 0.82, 0, w, hh * 0.04, w, hh * 0.3);
      body.bezierCurveTo(w, hh * 0.42, w * 0.94, hh * 0.72, w / 2, hh);
      body.closePath();
      void top;
    } else if (b.kind === 'shout') {
      const per = Math.PI * (W + H) / 2, n = Math.max(10, Math.round(per / (size * 0.9)));
      for (let i = 0; i < n * 2; i++) {
        const a = i / (n * 2) * 6.2832 - 1.5708, k = i % 2 ? 0.8 : 1, px = W / 2 + W / 2 * k * Math.cos(a), py = H / 2 + H / 2 * k * Math.sin(a);
        if (i) body.lineTo(px, py); else body.moveTo(px, py);
      }
      body.closePath();
    } else {
      const r = Math.min(H / 2, W / 2, size * 0.6);
      body.moveTo(r, 0); body.arcTo(W, 0, W, H, r); body.arcTo(W, H, 0, H, r); body.arcTo(0, H, 0, 0, r); body.arcTo(0, 0, W, 0, r); body.closePath();
    }
    parts.push(body);
    if (T > 0 && b.kind !== 'heart') {
      const left = b.tail !== 'right', dir = left ? -1 : 1, tx = left ? W * 0.24 : W * 0.76;
      const edge = (px) => (curved ? H / 2 + H / 2 * Math.sqrt(Math.max(0, 1 - Math.pow((px - W / 2) / (W / 2), 2))) * (b.kind === 'shout' ? 0.78 : 0.94) : H);      // where the body ends at this x
      const p = new Path2D();
      if (b.kind === 'cloud') {
        p.arc(tx + dir * T * 0.1, H + T * 0.3, T * 0.21, 0, 6.2832);
        const p2 = new Path2D(); p2.arc(tx + dir * T * 0.48, H + T * 0.78, T * 0.12, 0, 6.2832); parts.push(p2);
      } else {
        const hw = T * 0.34;
        p.moveTo(tx - hw, edge(tx - hw) - size * 0.2); p.lineTo(tx + hw, edge(tx + hw) - size * 0.2); p.lineTo(tx + dir * T * 0.55, H + T); p.closePath();
      }
      parts.push(p);
    }
    x.lineJoin = 'round';
    if (lw > 0 && b.line) { x.strokeStyle = b.line; x.lineWidth = lw * 2; for (const p of parts) x.stroke(p); }
    x.fillStyle = b.fill || '#ffffff';
    for (const p of parts) x.fill(p);
  }

  function roundRect(x, X, Y, W, H, r) {
    r = Math.max(0, Math.min(r, W / 2, H / 2));
    x.beginPath();
    x.moveTo(X + r, Y); x.lineTo(X + W - r, Y); x.arcTo(X + W, Y, X + W, Y + r, r);
    x.lineTo(X + W, Y + H - r); x.arcTo(X + W, Y + H, X + W - r, Y + H, r);
    x.lineTo(X + r, Y + H); x.arcTo(X, Y + H, X, Y + H - r, r);
    x.lineTo(X, Y + r); x.arcTo(X, Y, X + r, Y, r);
    x.closePath();
  }
  Layers.roundRect = roundRect;
  /* g = {x0,y0,x1,y1 (0..1 of the box), stops:[[pos,colour],…], radial} -> a canvas gradient over the box [X,Y,W,H] */
  Layers.gradient = function (ctx, g, X, Y, W, H) {
    const ax = X + g.x0 * W, ay = Y + g.y0 * H, bx = X + g.x1 * W, by = Y + g.y1 * H;
    const cg = g.radial ? ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(1, Math.hypot(bx - ax, by - ay))) : ctx.createLinearGradient(ax, ay, bx, by);
    for (const s of g.stops) { try { cg.addColorStop(U.clamp(s[0], 0, 1), s[1]); } catch (e) { /* skip a bad stop */ } }
    return cg;
  };

  TextRender.render = function (l) {
    const L = TextRender.layout(l);
    const want = quant(Math.max(l.scaleX, l.scaleY));
    const fullW = L.w + 2 * L.M, fullH = L.h + 2 * L.M;
    const q = Math.max(0.02, Math.min(want, 4096 / fullW, 4096 / fullH));
    const cw = Math.max(1, Math.ceil(fullW * q)), ch = Math.max(1, Math.ceil(fullH * q));
    const prep = function (ctx) {
      ctx.setTransform(q, 0, 0, q, L.M * q, L.M * q);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.imageSmoothingQuality = 'high';
    };
    /* kind: 'stroke' | 'fill' (each piece in its own colour) | 'mask' (one colour, for the gradient) */
    const pass = function (ctx, kind) {
      let f = null, c = null;
      for (const m of L.cmds) {
        if (m.f !== f) { f = m.f; ctx.font = f; if (hasLS) ctx.letterSpacing = L.ls + 'px'; }
        if (kind === 'fill' && m.c !== c) { c = m.c; ctx.fillStyle = c; }
        if (m.rot) {
          ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.rot);
          if (m.sk) ctx.transform(1, 0, -m.sk, 1, 0, 0);
          if (kind === 'stroke') ctx.strokeText(m.s, m.dx, 0); else ctx.fillText(m.s, m.dx, 0);
          ctx.restore();
        } else if (m.sk) {
          ctx.save(); ctx.transform(1, 0, -m.sk, 1, m.x + m.dx, m.y);
          if (kind === 'stroke') ctx.strokeText(m.s, 0, 0); else ctx.fillText(m.s, 0, 0);
          ctx.restore();
        } else if (kind === 'stroke') ctx.strokeText(m.s, m.x + m.dx, m.y); else ctx.fillText(m.s, m.x + m.dx, m.y);
      }
    };
    const tcan = U.canvas(cw, ch), t = tcan.getContext('2d');
    prep(t);
    if (L.sw > 0) { t.strokeStyle = l.stroke.color; t.lineWidth = L.sw * 2; pass(t, 'stroke'); }
    if ((l.grad && l.grad.stops && l.grad.stops.length > 1) || l.texture) {
      const gcan = U.canvas(cw, ch), g = gcan.getContext('2d');
      prep(g);
      g.fillStyle = '#fff'; pass(g, 'mask');
      g.globalCompositeOperation = 'source-in';
      if (l.texture) {
        /* a picture inside the letters (the Style menu's Texture): it is fitted over the words */
        const bw = L.box[2] || fullW, bh = L.box[3] || fullH;
        const k = Math.max(bw / l.texture.width, bh / l.texture.height);
        const dw = l.texture.width * k, dh = l.texture.height * k;
        g.drawImage(l.texture, L.box[0] + (bw - dw) / 2, L.box[1] + (bh - dh) / 2, dw, dh);
      } else {
        g.fillStyle = Layers.gradient(g, l.grad, L.box[0], L.box[1], L.box[2], L.box[3]);
        g.fillRect(-L.M, -L.M, fullW, fullH);
      }
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.drawImage(gcan, 0, 0);
    } else pass(t, 'fill');

    const out = U.canvas(cw, ch), o = out.getContext('2d', { willReadFrequently: true });   // (trimBox reads it once)
    if (L.bub) {
      o.save();
      o.setTransform(q, 0, 0, q, L.M * q, L.M * q);
      drawBubble(o, l.bubble, L.bub, l.size);
      o.restore();
    } else if (l.bg.on && !l.bend) {
      o.save();
      o.setTransform(q, 0, 0, q, L.M * q, L.M * q);
      o.fillStyle = U.rgba(l.bg.color, l.bg.opacity);
      roundRect(o, 0, 0, L.w, L.h, l.bg.radius / 100 * Math.min(L.w, L.h) / 2);
      o.fill();
      o.restore();
    }
    if (l.shadow.on && l.shadow.opacity > 0) {
      o.shadowColor = U.rgba(l.shadow.color, l.shadow.opacity);
      o.shadowBlur = l.shadow.blur * l.size / 100 * q;
      o.shadowOffsetX = l.shadow.dx * l.size / 100 * q;
      o.shadowOffsetY = l.shadow.dy * l.size / 100 * q;
    }
    o.drawImage(tcan, 0, 0);
    l._cache = { canvas: out, q: want, w: L.w, h: L.h, M: L.M };
    l._cache.tb = trimBox(o, cw, ch, q, L);     // where the words really are: the selection box hugs them
    return l._cache;
  };
  /* The real extent of the drawn words (they are laid out inside a box with room for a stroke, so the drawn
     picture is bigger than the letters).  Returns the box in the text's own coordinates, so the selection
     frame can sit exactly on the letters like the app in the owner's video.  Scanned on a small copy: fast. */
  function trimBox(ctx, cw, ch, q, L) {
    try {
      const k = Math.min(1, 240 / Math.max(cw, ch));
      const w = Math.max(1, Math.round(cw * k)), hh = Math.max(1, Math.round(ch * k));
      const sc = U.canvas(w, hh), sx = sc.getContext('2d', { willReadFrequently: true });  // (a small copy: cheap)
      sx.drawImage(ctx.canvas, 0, 0, w, hh);
      const d = sx.getImageData(0, 0, w, hh).data;
      let x0 = w, y0 = hh, x1 = -1, y1 = -1;
      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < w; x++) {
          if (d[(y * w + x) * 4 + 3] > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 < x0 || y1 < y0) return null;
      const toL = (v) => v / k / q;                     // small-canvas px -> the text's own px
      const fullW = cw / q, fullH = ch / q;
      return { X0: -fullW / 2 + toL(x0), Y0: -fullH / 2 + toL(y0), W: Math.max(1, toL(x1 + 1 - x0)), H: Math.max(1, toL(y1 + 1 - y0)) };
    } catch (e) { return null; }
  }

  /* How far sideways the words sit.  The nudge is kept as a % of the picture's width (the same on every
     screen) and turned into pixels here; it MOVES the layer, so the selection box goes with the words. */
  TextRender.shift = function (l) {
    if (!l.nudge) return 0;
    return l.nudge / 100 * Math.max(Doc.width || 0, 1);
  };
  /* the layer's own x, with its nudge added (the nudge is a real move of the words AND their box) */
  TextRender.baseX = function (l) { return l.x + (l.type === 'text' ? TextRender.shift(l) : 0); };
  /* keep a layer inside the picture: the words can never be dragged (or nudged) out of it.
     Returns the x that is allowed.  (A picture bigger than the canvas may still cover it all.) */
  Layers.allowedX = function (l, x) {
    const s = Layers.size(l), half = Math.max(0, (s.w * Math.abs(l.scaleX)) / 2);
    const W = Doc.width || 0;
    if (!W || !half) return x;
    if (half * 2 >= W) return U.clamp(x, W - half, half);       // (wider than the picture: it stays over the middle)
    return U.clamp(x, half, W - half);
  };
  Layers.keepInside = function (l) {
    if (l.type === 'text' && l.nudge) {
      /* the % is what the owner reads: turn the words back to a position the picture can hold */
      const x = TextRender.baseX(l);
      const ok = Layers.allowedX(l, x);
      if (Math.abs(ok - x) > 0.5) l.nudge = Math.round(((ok - l.x) / Math.max(1, Doc.width)) * 100);
    }
    l.x = Layers.allowedX(l, TextRender.baseX(l));
  };
  TextRender.ensure = function (l) {
    const c = l._cache;
    if (c && c.q === quant(Math.max(l.scaleX, l.scaleY))) return c;
    return TextRender.render(l);
  };

  /* ---------------- document ---------------- */
  const opaqueCache = new WeakMap();
  function opaque(bitmap) {                       // true when the picture has no see-through pixels (checked on a small copy, remembered)
    let v = opaqueCache.get(bitmap);
    if (v === undefined) {
      const c = U.canvas(64, 64), x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(bitmap, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data;
      v = true;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { v = false; break; }
      opaqueCache.set(bitmap, v);
    }
    return v;
  }
  Object.assign(Doc, {
    width: 0, height: 0, bg: { type: 'none', color: '#ffffff' }, layers: [], selectedId: null, open: false,
    name: '',            // project name (shown in My folders)
    pid: null,           // id of the saved project this document belongs to, if any
    serial: 0,           // goes up every time another document is opened

    /* open a ready-made document: { width, height, bg, layers, name?, pid? } */
    load: function (d) {
      this.width = d.width; this.height = d.height;
      this.bg = Object.assign({ type: 'none', color: '#ffffff' }, d.bg || {});
      this.layers = d.layers || []; this.selectedId = null; this.open = true;
      this.name = d.name || ''; this.pid = d.pid || null; this.serial++;
      History.reset();
      U.emit('doc');
    },

    fromCanvas: function (c) {
      this.width = c.width; this.height = c.height;
      this.bg = { type: 'none', color: '#ffffff' };
      this.layers = [Layers.image(c, { name: 'Background', x: c.width / 2, y: c.height / 2, locked: true, base: true })];
      this.selectedId = null; this.open = true; this.name = ''; this.pid = null; this.serial++;
      History.reset();
      U.emit('doc');
    },
    blank: function (w, h, color) {
      this.width = w; this.height = h;
      this.bg = color ? { type: 'color', color: color } : { type: 'none', color: '#ffffff' };
      this.layers = []; this.selectedId = null; this.open = true; this.name = ''; this.pid = null; this.serial++;
      History.reset();
      U.emit('doc');
    },
    close: function () { this.layers = []; this.open = false; this.selectedId = null; this.name = ''; this.pid = null; History.clear(); },
    get: function (id) { for (const l of this.layers) if (l.id === id) return l; return null; },
    selected: function () { return this.selectedId ? this.get(this.selectedId) : null; },
    index: function (id) { return this.layers.findIndex((l) => l.id === id); },
    select: function (id) {
      if (id && !this.get(id)) id = null;
      if (this.selectedId === id) return;
      this.selectedId = id || null;
      U.emit('select');
    },
    add: function (l) { this.layers.push(l); return l; },
    remove: function (id) {
      const i = this.index(id);
      if (i < 0) return;
      this.layers.splice(i, 1);
      if (this.selectedId === id) { this.selectedId = null; U.emit('select'); }
    },
    duplicate: function (id) {
      const l = this.get(id); if (!l) return null;
      const c = Layers.clone(l);
      c.id = U.uid(); c.base = false; c.locked = false;
      const d = Math.max(this.width, this.height) * 0.03;
      c.x += d; c.y += d;
      this.layers.splice(this.index(id) + 1, 0, c);
      return c;
    },
    /* dir: +1 up, -1 down, 'front', 'back' */
    reorder: function (id, dir) {
      const i = this.index(id); if (i < 0) return false;
      let j = dir === 'front' ? this.layers.length - 1 : dir === 'back' ? 0 : i + dir;
      j = U.clamp(j, 0, this.layers.length - 1);
      if (j === i) return false;
      const l = this.layers.splice(i, 1)[0];
      this.layers.splice(j, 0, l);
      return true;
    },
    /* the picture that Adjust / Effects / Curves should work on */
    targetImage: function () {
      const s = this.selected();
      if (s && s.type === 'image') return s;
      for (const l of this.layers) if (l.type === 'image' && l.base) return l;
      for (const l of this.layers) if (l.type === 'image') return l;
      return null;
    },
    composite: function (ctx, o) {
      o = o || {};
      if (this.bg.type === 'color' && o.bg !== false) { ctx.fillStyle = this.bg.color; ctx.fillRect(0, 0, this.width, this.height); }
      for (const l of this.layers) {
        if (o.hide && o.hide.has(l.id)) continue;
        Layers.draw(ctx, l, o.overrides ? o.overrides.get(l.id) : null);
      }
    },
    flatten: function (o) {
      o = o || {};
      const k = o.maxDim ? Math.min(1, o.maxDim / Math.max(this.width, this.height)) : 1;
      const c = U.canvas(this.width * k, this.height * k), x = c.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.scale(c.width / this.width, c.height / this.height);
      if (o.fill) { x.fillStyle = o.fill; x.fillRect(0, 0, this.width, this.height); }
      this.composite(x, o);
      return c;
    },
    /* would the saved picture have see-through parts? (decides JPG or PNG) */
    hasTransparency: function () {
      if (this.bg.type === 'color') return false;
      for (const l of this.layers) {
        if (l.type !== 'image' || !l.visible || l.opacity < 1 || (l.blend && l.blend !== 'source-over')) continue;
        const covers = !l.rotation && Math.abs(l.scaleX) === 1 && Math.abs(l.scaleY) === 1 && l.bitmap.width >= this.width && l.bitmap.height >= this.height &&
          Math.abs(l.x - this.width / 2) <= (l.bitmap.width - this.width) / 2 + 0.5 && Math.abs(l.y - this.height / 2) <= (l.bitmap.height - this.height) / 2 + 0.5;
        if (covers && opaque(l.bitmap)) return false;
      }
      return true;
    },
    /* Move / turn / flip / scale the whole document.
       ops are applied in order:
         {t:'translate',dx,dy} {t:'scale',k,kx,ky} {t:'rotate',a,cx,cy} {t:'flipH',w} {t:'flipV',h}
       The background photo is redrawn to fill the new canvas; every other layer just gets new numbers. */
    matrix: function (ops) {
      let M = new DOMMatrix();
      for (const op of ops) {
        let m = new DOMMatrix();
        if (op.t === 'translate') m = m.translate(op.dx, op.dy);
        else if (op.t === 'scale') m = m.scale(op.kx || op.k, op.ky || op.k);
        else if (op.t === 'rotate') m = m.translate(op.cx, op.cy).rotate(op.a * 180 / Math.PI).translate(-op.cx, -op.cy);
        else if (op.t === 'flipH') m = m.translate(op.w, 0).scale(-1, 1);
        else if (op.t === 'flipV') m = m.translate(0, op.h).scale(1, -1);
        M = m.multiply(M);
      }
      return M;
    },
    transform: function (ops, newW, newH) {
      newW = Math.max(1, Math.round(newW)); newH = Math.max(1, Math.round(newH));
      const M = this.matrix(ops);
      for (const l of this.layers) {
        if (l.type === 'image' && l.base) {
          const c = U.canvas(newW, newH), x = c.getContext('2d');
          x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
          x.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
          Layers.drawRaw(x, l);
          l.bitmap = c; l.x = newW / 2; l.y = newH / 2; l.scaleX = l.scaleY = 1; l.rotation = 0; l.flipH = l.flipV = false;
          continue;
        }
        for (const op of ops) {
          if (op.t === 'translate') { l.x += op.dx; l.y += op.dy; }
          else if (op.t === 'scale') { l.x *= (op.kx || op.k); l.y *= (op.ky || op.k); l.scaleX *= op.k; l.scaleY *= op.k; }
          else if (op.t === 'rotate') {
            const dx = l.x - op.cx, dy = l.y - op.cy, c = Math.cos(op.a), s = Math.sin(op.a);
            l.x = op.cx + dx * c - dy * s; l.y = op.cy + dx * s + dy * c; l.rotation += op.a;
          }
          else if (op.t === 'flipH') { l.x = op.w - l.x; l.rotation = -l.rotation; l.flipH = !l.flipH; }
          else if (op.t === 'flipV') { l.y = op.h - l.y; l.rotation = -l.rotation; l.flipV = !l.flipV; }
        }
      }
      this.width = newW; this.height = newH;
    }
  });

  /* ---------------- undo / redo ---------------- */
  Object.assign(History, {
    states: [], idx: -1, MAX_STATES: 40, MAX_BYTES: LOW_MEM ? 64e6 : 110e6,
    pinned: new Set(),          // sets of pictures that are in use elsewhere right now (a project being saved): never recycled
    /* give back the memory of pictures that only the dropped states were using */
    release: function (dropped) {
      if (!dropped.length) return;
      const keep = new Set();
      for (const set of this.pinned) for (const b of set) keep.add(b);
      for (const s of this.states) for (const l of s.layers) if (l.bitmap) keep.add(l.bitmap);
      for (const l of Doc.layers) if (l.bitmap) keep.add(l.bitmap);
      for (const s of dropped) for (const l of s.layers) {
        const b = l.bitmap;
        if (b && !keep.has(b)) { keep.add(b); b.width = 1; b.height = 1; }
      }
    },
    snap: function () {
      return { width: Doc.width, height: Doc.height, bg: Object.assign({}, Doc.bg), layers: Doc.layers.map(Layers.clone), selectedId: Doc.selectedId };
    },
    clear: function () { const d = this.states; this.states = []; this.idx = -1; this.release(d); U.emit('history'); },
    reset: function () { const d = this.states; this.states = [this.snap()]; this.idx = 0; this.release(d); U.emit('history'); },
    /* call after every finished change */
    commit: function () {
      const dropped = this.states.splice(this.idx + 1);
      this.states.push(this.snap());
      this.idx++;
      while (this.states.length > 3 && (this.states.length > this.MAX_STATES || this.bytes() > this.MAX_BYTES)) { dropped.push(this.states.shift()); this.idx--; }
      this.release(dropped);
      U.emit('history');
    },
    bytes: function () {
      const seen = new Set(); let b = 0;
      for (const s of this.states) for (const l of s.layers) if (l.bitmap && !seen.has(l.bitmap)) { seen.add(l.bitmap); b += l.bitmap.width * l.bitmap.height * 4; }
      return b;
    },
    restore: function (s) {
      Doc.width = s.width; Doc.height = s.height; Doc.bg = Object.assign({}, s.bg);
      Doc.layers = s.layers.map(Layers.clone);
      const keep = Doc.selectedId && Doc.get(Doc.selectedId) ? Doc.selectedId : null;
      Doc.selectedId = keep;
      U.emit('doc'); U.emit('select'); U.emit('history');
    },
    canUndo: function () { return this.idx > 0; },
    canRedo: function () { return this.idx < this.states.length - 1; },
    undo: function () { if (this.canUndo()) { this.idx--; this.restore(this.states[this.idx]); return true; } return false; },
    redo: function () { if (this.canRedo()) { this.idx++; this.restore(this.states[this.idx]); return true; } return false; },
    dirty: function () { return this.idx > 0; }
  });
})();
