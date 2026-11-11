'use strict';
/* ============================================================
 * 17-shapes.js : a small library of outlines (circle, star, heart …)
 * used by Shape, Shape Crop, Shape Mask and Frame, and the Shape
 * tool itself: a coloured shape as a layer.
 *
 * A shape layer is an ordinary picture layer that also carries
 *   layer.shape = { id, fill, line, lw }
 * so its colours can be changed later (the picture is drawn again).
 * ============================================================ */
const Shapes = {};
const ShapeTool = {};
(function () {
  const h = U.h;
  const f1 = (v) => Math.round(v * 10) / 10;
  /* a regular polygon in the 100 × 100 box, or a star when inner (0..1) is given */
  function poly(n, rot, inner) {
    const pts = [], m = inner ? n * 2 : n;
    for (let i = 0; i < m; i++) {
      const a = (rot + i * 360 / m) * Math.PI / 180, r = inner && (i % 2) ? 50 * inner : 50;
      pts.push(f1(50 + r * Math.cos(a)) + ' ' + f1(50 + r * Math.sin(a)));
    }
    return 'M' + pts.join('L') + 'Z';
  }
  const circ = (cx, cy, r) => 'M' + f1(cx + r) + ' ' + f1(cy) + 'A' + r + ' ' + r + ' 0 1 0 ' + f1(cx - r) + ' ' + f1(cy) + 'A' + r + ' ' + r + ' 0 1 0 ' + f1(cx + r) + ' ' + f1(cy) + 'Z';
  let flower = circ(50, 50, 20);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; flower += circ(50 + 29 * Math.cos(a), 50 + 29 * Math.sin(a), 21); }

  const LIST = [
    ['rect', 'Square', 'M0 0H100V100H0Z'],
    ['round', 'Rounded', 'M20 0H80A20 20 0 0 1 100 20V80A20 20 0 0 1 80 100H20A20 20 0 0 1 0 80V20A20 20 0 0 1 20 0Z'],
    ['circle', 'Circle', circ(50, 50, 50)],
    ['triangle', 'Triangle', 'M50 0L100 100H0Z'],
    ['diamond', 'Diamond', 'M50 0L100 50L50 100L0 50Z'],
    ['pentagon', 'Pentagon', poly(5, -90)],
    ['hexagon', 'Hexagon', poly(6, 0)],
    ['octagon', 'Octagon', poly(8, 22.5)],
    ['star', 'Star', poly(5, -90, 0.42)],
    ['burst', 'Burst', poly(12, -90, 0.76)],
    ['seal', 'Seal', poly(20, -90, 0.9)],
    ['heart', 'Heart', 'M50 100C14 74 0 54 0 32C0 14 13 0 30 0C40 0 47 6 50 14C53 6 60 0 70 0C87 0 100 14 100 32C100 54 86 74 50 100Z'],
    ['drop', 'Drop', 'M50 0C50 0 100 50 100 68A50 32 0 0 1 0 68C0 50 50 0 50 0Z'],
    ['flower', 'Flower', flower],
    ['cloud', 'Cloud', 'M27 90A24 24 0 0 1 21 44A30 30 0 0 1 75 33A29 29 0 0 1 80 90Z'],
    ['bubble', 'Bubble', 'M10 0H90A10 10 0 0 1 100 10V62A10 10 0 0 1 90 72H42L20 100V72H10A10 10 0 0 1 0 62V10A10 10 0 0 1 10 0Z'],
    ['arrow', 'Arrow', 'M0 30H55V0L100 50L55 100V70H0Z'],
    ['cross', 'Cross', 'M33 0H67V33H100V67H67V100H33V67H0V33H33Z'],
    ['moon', 'Moon', 'M62 3A48 48 0 1 0 97 62A38 38 0 0 1 62 3Z'],
    ['bolt', 'Bolt', 'M58 0L10 56H42L34 100L90 40H56Z'],
    ['shield', 'Shield', 'M50 0L100 14V48C100 76 78 94 50 100C22 94 0 76 0 48V14Z'],
    ['arch', 'Arch', 'M0 100V50A50 50 0 0 1 100 50V100Z'],
    ['para', 'Slanted', 'M25 0H100L75 100H0Z'],
    ['trap', 'Trapezoid', 'M20 0H80L100 100H0Z']
  ];
  /* three more outlines, so every group has enough to choose from */
  LIST.push(['rect2', 'Rectangle', 'M0 18H100V82H0Z']);
  LIST.push(['ellipse', 'Oval', 'M50 0A50 40 0 1 0 50 80A50 40 0 1 0 50 0Z']);
  LIST.push(['strip', 'Strip', 'M0 32H100V68H0Z']);
  /* the groups shown above the shapes (like the video: Basic / Shapes / Arrows …) */
  const GROUPS = [
    ['basic', 'Basic', ['rect', 'rect2', 'round', 'circle', 'ellipse', 'triangle']],
    ['many', 'Many sides', ['diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'burst', 'seal']],
    ['love', 'Hearts & more', ['heart', 'drop', 'flower', 'cloud', 'moon']],
    ['lines', 'Lines & signs', ['strip', 'cross', 'bubble', 'arch', 'para', 'trap', 'arrow', 'bolt', 'shield']]
  ];
  Shapes.groups = GROUPS.map((g) => ({ id: g[0], name: g[1], ids: g[2] }));
  Shapes.order = Shapes.groups.reduce((a, g) => a.concat(g.ids), []);
  /* the shape d steps after this one (the ‹ › arrows of the crop) */
  Shapes.step = function (id, d) {
    const n = Shapes.order.length, i = Shapes.order.indexOf(id);
    return Shapes.order[((i < 0 ? 0 : i) + d + n * 2) % n];
  };
  const byId = {};
  Shapes.list = LIST.map((s) => (byId[s[0]] = { id: s[0], name: s[1], d: s[2], p: null, b: null }));
  Shapes.get = (id) => byId[id] || byId.rect;

  /* the outline as a Path2D plus the box it really fills (measured once, so every shape fits its frame exactly) */
  function prep(s) {
    if (s.p) return s;
    s.p = new Path2D(s.d);
    let b = null;
    try {
      const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), el = document.createElementNS(NS, 'path');
      el.setAttribute('d', s.d); svg.appendChild(el);
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
      document.body.appendChild(svg);
      const r = el.getBBox(); svg.remove();
      if (r && r.width > 1 && r.height > 1) b = [r.x, r.y, r.width, r.height];
    } catch (e) { b = null; }
    s.b = b || [0, 0, 100, 100];
    return s;
  }
  /* the outline laid into the box x, y, w, h -> Path2D (use with fill / stroke / clip) */
  Shapes.path = function (id, x, y, w, hh) {
    const s = prep(Shapes.get(id)), b = s.b, p = new Path2D();
    p.addPath(s.p, new DOMMatrix([w / b[2], 0, 0, hh / b[3], x - b[0] * w / b[2], y - b[1] * hh / b[3]]));
    return p;
  };
  /* natural width / height of the shape */
  Shapes.ratio = (id) => { const b = prep(Shapes.get(id)).b; return b[2] / b[3]; };
  Shapes.svg = (id, size) => '<svg viewBox="-6 -6 112 112" width="' + size + '" height="' + size + '" aria-hidden="true"><path d="' + Shapes.get(id).d + '" fill="currentColor"/></svg>';
  /* the shape picker with its groups: a row of group chips, then that group's shapes */
  Shapes.picker = function (value, onPick, opts) {
    opts = opts || {};
    const wrap = h('div', { class: 'shp-pick' });
    const first = Shapes.groups.find((g) => g.ids.indexOf(value) >= 0) || Shapes.groups[0];
    let cur = first.id;
    const chips = h('div', { class: 'chips shp-groups' });
    const grid = h('div', { class: 'shp-grid' });
    const fill = () => {
      U.clear(grid);
      const g = Shapes.groups.find((x) => x.id === cur) || Shapes.groups[0];
      for (const id of g.ids) {
        const sh = Shapes.get(id);
        const b = h('button', { class: 'shp-cell' + (id === value ? ' on' : ''), type: 'button', title: sh.name, 'aria-label': sh.name, 'data-id': id, html: Shapes.svg(id, 42) });
        U.onTap(b, () => {
          for (const c of grid.children) c.classList.toggle('on', c === b);
          onPick(id);
        });
        grid.appendChild(b);
      }
    };
    for (const g of Shapes.groups) {
      const b = h('button', { class: 'chip' + (g.id === cur ? ' on' : ''), type: 'button', 'data-v': g.id, text: g.name });
      U.onTap(b, () => {
        cur = g.id;
        for (const c of chips.children) c.classList.toggle('on', c === b);
        fill();
      });
      chips.appendChild(b);
    }
    wrap.append(chips, grid);
    fill();
    /* show another shape without asking for it (the arrows of the crop use this) */
    wrap.setShape = function (id) {
      value = id;
      const g = Shapes.groups.find((x) => x.ids.indexOf(id) >= 0);
      if (g && g.id !== cur) {
        cur = g.id;
        for (const c of chips.children) c.classList.toggle('on', c.dataset.v === cur);
        fill();
        chips.querySelector('.chip.on').scrollIntoView({ block: 'nearest', inline: 'center' });
      }
      for (const c of grid.children) c.classList.toggle('on', c.dataset.id === id);
      const on = grid.querySelector('.shp-cell.on');
      if (on && on.scrollIntoView) grid.scrollLeft = Math.max(0, on.offsetLeft - grid.clientWidth / 2 + on.offsetWidth / 2);
    };
    wrap.el = wrap;
    wrap.shape = () => value;
    return wrap;
  };
  /* a row of shape buttons to choose from */
  Shapes.strip = function (value, onPick) {
    const strip = h('div', { class: 'shp-strip' });
    for (const s of Shapes.list) {
      const b = h('button', { class: 'shp-it' + (s.id === value ? ' on' : ''), type: 'button', title: s.name, 'aria-label': s.name, 'data-id': s.id, html: Shapes.svg(s.id, 30) });
      U.onTap(b, () => { for (const c of strip.children) c.classList.toggle('on', c === b); onPick(s.id); });
      strip.appendChild(b);
    }
    return strip;
  };

  /* ---------- the shape as a picture ---------- */
  const SIDE = 640;
  /* spec: { id, fill ('' = none), line ('' = none), lw (line width in % of the size) } */
  Shapes.render = function (spec) {
    const r = Shapes.ratio(spec.id), w = r >= 1 ? SIDE : SIDE * r, hh = r >= 1 ? SIDE / r : SIDE;
    const lw = spec.line ? Math.max(0, spec.lw || 0) / 100 * SIDE : 0, m = Math.ceil(lw / 2) + 2;
    const c = U.canvas(w + 2 * m, hh + 2 * m), x = c.getContext('2d');
    const p = Shapes.path(spec.id, m, m, w, hh);
    if (spec.fill) { x.fillStyle = spec.fill; x.fill(p); }
    if (lw > 0) { x.strokeStyle = spec.line; x.lineWidth = lw; x.lineJoin = 'round'; x.stroke(p); }
    if (!spec.fill && !(lw > 0)) { x.fillStyle = 'rgba(128,128,128,.35)'; x.fill(p); }      // never an invisible layer
    return c;
  };
  /* draw the picture of a shape layer again after its colours changed */
  Shapes.restyle = function (l) { if (l && l.shape) l.bitmap = Shapes.render(l.shape); };

  /* ============================ SHAPE (toolbar) ============================ */
  /* Shape is only a crop: the photo (or the whole canvas) is cut to the shape you pick, nothing is added.
     The picking, the ‹ › arrows and the frame all live in ShapeCrop (18-bench.js). */
  const mem = { fill: '#f43f5e' };
  ShapeTool.open = function (target) { ShapeCrop.open(target); };
  /* old projects may still hold a coloured shape layer: its colours can still be changed */
  /* toolbar entries for a selected shape layer (used by ObjOpts) */
  ShapeTool.items = function (l, P, pad, commit) {
    const again = () => { Shapes.restyle(l); View.request(); };
    return [
      P('fill', 'bucket', 'Fill', () => pad(UI.palette({
        value: l.shape.fill || 'none', none: true,
        onPick: (c, fin) => { l.shape.fill = c; mem.fill = c; again(); if (fin) commit(); },
        onNone: () => { l.shape.fill = ''; if (!l.shape.line) { l.shape.line = '#ffffff'; l.shape.lw = l.shape.lw || 4; } again(); commit(); }
      }))),
      P('outline', 'strokeA', 'Outline', () => pad(
        UI.palette({
          value: l.shape.line || 'none', none: true,
          onPick: (c, fin) => { l.shape.line = c; if (!l.shape.lw) l.shape.lw = 4; again(); if (fin) commit(); },
          onNone: () => { l.shape.line = ''; again(); commit(); }
        }),
        UI.slider({ label: 'Width', min: 1, max: 30, value: l.shape.lw || 4, onInput: (v) => { l.shape.lw = v; if (!l.shape.line) l.shape.line = '#ffffff'; again(); }, onChange: commit }))),
      P('shapepick', 'shape', 'Shape', () => pad(Shapes.picker(l.shape.id, (id) => { l.shape.id = id; again(); commit(); })))
    ];
  };
})();
