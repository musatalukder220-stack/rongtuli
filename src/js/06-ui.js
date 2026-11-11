'use strict';
/* ============================================================
 * 06-ui.js : screens, top bar, bottom toolbar, panels, sheets,
 * sliders, colour palette and the "mode" system used by tools.
 * ============================================================ */
const UI = {};
(function () {
  const h = U.h;
  const E = {};
  let mode = null, toolsOpen = false, applying = false, backArmed = false;
  const openSheets = [];

  const COLORS = ['#ffffff', '#000000', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#fde047', '#a3e635', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#fda4af', '#fed7aa', '#fef08a', '#bbf7d0', '#bae6fd', '#ddd6fe',
    '#7c2d12', '#78350f', '#14532d', '#1e3a8a', '#4c1d95', '#6b7280', '#d1d5db'];
  UI.COLORS = COLORS;

  /* ---------- small builders ---------- */
  function tbtn(icon, title, fn, cls) {
    const b = h('button', { class: 'tbtn' + (cls ? ' ' + cls : ''), type: 'button', title: title, 'aria-label': title, html: I.svg(icon, 26) });
    U.onTap(b, fn);
    return b;
  }
  UI.tbtn = tbtn;
  UI.ibtn = function (icon, title, fn, cls) {
    const b = h('button', { class: 'ibtn' + (cls ? ' ' + cls : ''), type: 'button', title: title, 'aria-label': title, html: I.svg(icon, 21) });
    U.onTap(b, fn);
    return b;
  };

  function tbItem(it) {
    if (it.sep) return h('div', { class: 'tb-sep' });
    const b = h('button', { class: 'tb-item' + (it.soon ? ' soon' : '') + (it.active ? ' active' : '') + (it.danger ? ' danger' : ''), type: 'button', 'data-id': it.id || '' },
      I.el(it.icon), h('span', { class: 'lb', text: it.label }),
      it.soon ? h('span', { class: 'badge', text: 'SOON' }) : null,
      it.dot ? h('i', { class: 'dot' }) : null);
    U.onTap(b, () => { if (it.soon) U.toast(it.label + ' is coming in a later update'); else if (it.onTap) it.onTap(b); });
    return b;
  }
  UI.setToolbar = function (items) {
    U.clear(E.toolbar); E.toolbar.classList.remove('hidden');
    for (const it of items) if (it) E.toolbar.appendChild(tbItem(it));
    E.toolbar.scrollLeft = 0;
  };
  UI.setToolbarNode = function (node) {
    U.clear(E.toolbar);
    if (!node) { E.toolbar.classList.add('hidden'); return; }
    E.toolbar.classList.remove('hidden');
    E.toolbar.appendChild(node);
    E.toolbar.scrollLeft = 0;
  };
  UI.markActive = function (id) {
    for (const el of E.toolbar.querySelectorAll('.tb-item')) el.classList.toggle('active', !!id && el.dataset.id === id);
  };
  UI.setDot = function (id, on) {
    const el = E.toolbar.querySelector('.tb-item[data-id="' + id + '"]');
    if (!el) return;
    let d = el.querySelector('.dot');
    if (on && !d) el.appendChild(h('i', { class: 'dot' }));
    if (!on && d) d.remove();
  };
  /* a newer version was seen: the home page carries a strip about it */
  UI.updateStrip = function (info) { try { if (typeof HomeBar !== 'undefined') HomeBar.show(info); } catch (e) { /* the strip is a nicety */ } };
  UI.setPanel = function (node) { U.clear(E.panel); if (node) E.panel.appendChild(node); };
  UI.panelOpenFor = null;      // id of the toolbar item whose panel is showing
  /* show a panel for a toolbar item; tapping the same item again closes it */
  UI.togglePanel = function (id, build) {
    if (UI.panelOpenFor === id) { UI.panelOpenFor = null; UI.setPanel(null); UI.markActive(null); return; }
    UI.panelOpenFor = id; UI.setPanel(build()); UI.markActive(id);
  };

  /* ---------- slider / chips / palette ---------- */
  UI.slider = function (o) {
    const inp = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value, 'aria-label': o.label || 'value', class: o.cls || '' });
    const val = h('span', { class: 'sl-v' });
    const upd = function () {
      const v = +inp.value;
      val.textContent = o.fmt ? o.fmt(v) : String(Math.round(v));
      const pct = (v - o.min) / (o.max - o.min) * 100;
      let a = 0, b = pct;
      if (o.min < 0 && o.max > 0) { const z = (0 - o.min) / (o.max - o.min) * 100; a = Math.min(pct, z); b = Math.max(pct, z); }
      inp.style.setProperty('--a', a + '%'); inp.style.setProperty('--b', b + '%');
    };
    inp.addEventListener('input', () => { upd(); if (o.onInput) o.onInput(+inp.value); });
    inp.addEventListener('change', () => { if (o.onChange) o.onChange(+inp.value); });
    upd();
    const el = h('div', { class: 'sl' }, o.label ? h('span', { class: 'sl-l', text: o.label }) : null, inp, val);
    el.set = (v) => { inp.value = v; upd(); };
    el.input = inp;
    if (o.resetTo != null) U.onTap(val, () => { el.set(o.resetTo); if (o.onInput) o.onInput(o.resetTo); if (o.onChange) o.onChange(o.resetTo); });
    return el;
  };
  /* opts: [[value, label, icon?], ...] */
  UI.chips = function (opts, value, onPick) {
    const wrap = h('div', { class: 'chips' });
    const mark = (v) => { for (const c of wrap.children) c.classList.toggle('on', c.dataset.v === String(v)); };
    for (const o of opts) {
      const b = h('button', { class: 'chip', type: 'button', 'data-v': String(o[0]) }, o[2] ? I.el(o[2]) : null, o[1] ? h('span', { text: o[1] }) : null);
      U.onTap(b, () => { mark(o[0]); onPick(o[0]); });
      wrap.appendChild(b);
    }
    mark(value);
    wrap.set = mark;
    return wrap;
  };
  /* o: {value, onPick(hex, isFinal), none: bool, onNone()} */
  UI.palette = function (o) {
    const wrap = h('div', { class: 'pal' });
    let cur = (o.value || '').toLowerCase();
    const mark = () => { for (const c of wrap.children) c.classList.toggle('on', !!c.dataset.c && c.dataset.c === cur); };
    const custom = h('button', { class: 'sw custom', type: 'button', title: 'Custom colour', 'aria-label': 'Custom colour' });
    U.onTap(custom, () => UI.colorPicker(cur || '#ff0000', (hex, fin) => { cur = hex; mark(); o.onPick(hex, fin); }));
    wrap.appendChild(custom);
    if (o.none) {
      const n = h('button', { class: 'sw none', type: 'button', title: 'None', 'aria-label': 'None', 'data-c': 'none' });
      U.onTap(n, () => { cur = 'none'; mark(); o.onNone(); });
      wrap.appendChild(n);
    }
    for (const c of COLORS) {
      const b = h('button', { class: 'sw', type: 'button', style: { background: c }, 'data-c': c, 'aria-label': c });
      U.onTap(b, () => { cur = c; mark(); o.onPick(c, true); });
      wrap.appendChild(b);
    }
    mark();
    return wrap;
  };

  /* ---------- sheets + dialogs ---------- */
  UI.sheet = function (title, content, opts) {
    opts = opts || {};
    const body = h('div', { class: 'sheet-b' }, content || null);
    const api = { body: body, closed: false };
    api.close = function () { if (api.closed) return; api.closed = true; bd.remove(); const i = openSheets.indexOf(api); if (i >= 0) openSheets.splice(i, 1); if (opts.onClose) opts.onClose(); };
    openSheets.push(api);
    const sheet = h('div', { class: 'sheet' }, h('div', { class: 'sheet-h' }, h('span', { text: title }), tbtn('close', 'Close', api.close)), body);
    const bd = h('div', { class: 'backdrop' }, sheet);
    bd.addEventListener('pointerdown', (e) => { if (e.target === bd) api.close(); });
    E.sheets.appendChild(bd);
    api.el = sheet;
    return api;
  };
  UI.confirm = function (title, text, okLabel, cancelLabel) {
    return new Promise((resolve) => {
      const done = (v) => { bd.remove(); resolve(v); };
      const ok = h('button', { class: 'btn pri', type: 'button', text: okLabel || 'OK' });
      const no = h('button', { class: 'btn', type: 'button', text: cancelLabel || 'Cancel' });
      U.onTap(ok, () => done(true)); U.onTap(no, () => done(false));
      const bd = h('div', { class: 'backdrop center' }, h('div', { class: 'dialog' }, h('h3', { text: title }), h('p', { text: text || '' }), h('div', { class: 'acts' }, no, ok)));
      E.sheets.appendChild(bd);
    });
  };
  /* a question with several answers. options: [[id, label, primary?], …] — put the "do nothing" answer first. Resolves with the id. */
  UI.choose = function (title, text, options) {
    return new Promise((resolve) => {
      const done = (v) => { bd.remove(); resolve(v); };
      const acts = h('div', { class: 'acts col' });
      for (const o of options) {
        const b = h('button', { class: 'btn' + (o[2] ? ' pri' : ''), type: 'button', text: o[1], 'data-v': o[0] });
        U.onTap(b, () => done(o[0]));
        acts.appendChild(b);
      }
      const bd = h('div', { class: 'backdrop center' }, h('div', { class: 'dialog' }, h('h3', { text: title }), h('p', { text: text || '' }), acts));
      E.sheets.appendChild(bd);
    });
  };
  /* ask for a short text; resolves with it, or with null when cancelled. The box sits near the top so the keyboard does not cover it.
     o: { ok, placeholder, max, text } */
  UI.prompt = function (title, value, o) {
    o = o || {};
    return new Promise((resolve) => {
      const inp = h('input', { type: 'text', class: 'inp', maxlength: o.max || 40, value: value || '', placeholder: o.placeholder || '', 'aria-label': title, autocomplete: 'off', enterkeyhint: 'done' });
      const done = (v) => { bd.remove(); resolve(v); };
      const ok = h('button', { class: 'btn pri', type: 'button', text: o.ok || 'OK' });
      const no = h('button', { class: 'btn', type: 'button', text: 'Cancel' });
      const go = () => { const v = inp.value.replace(/\s+/g, ' ').trim(); if (!v) { inp.focus(); return; } done(v); };
      U.onTap(ok, go); U.onTap(no, () => done(null));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      const bd = h('div', { class: 'backdrop center top' }, h('div', { class: 'dialog' }, h('h3', { text: title }), o.text ? h('p', { text: o.text }) : null, inp, h('div', { class: 'acts' }, no, ok)));
      E.sheets.appendChild(bd);
      setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 60);
    });
  };
  UI.colorPicker = function (start, onChange) {
    const rgb0 = U.hexToRgb(start === 'none' ? '#ff0000' : start);
    let hsv = U.rgbToHsv(rgb0[0], rgb0[1], rgb0[2]);
    const sv = h('canvas', { class: 'cp-sv', width: 320, height: 170 });
    const prev = h('div', { class: 'cp-prev' });
    const hex = h('input', { class: 'cp-hex', type: 'text', maxlength: 7, spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Hex colour' });
    const cur = () => { const c = U.hsvToRgb(hsv[0], hsv[1], hsv[2]); return U.rgbToHex(c[0], c[1], c[2]); };
    function draw() {
      const x = sv.getContext('2d'), w = sv.width, hh = sv.height;
      x.fillStyle = 'hsl(' + hsv[0] + ',100%,50%)'; x.fillRect(0, 0, w, hh);
      let g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, hh);
      g = x.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, w, hh);
      const mx = hsv[1] * w, my = (1 - hsv[2]) * hh;
      x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.arc(mx, my, 9, 0, 6.2832); x.stroke();
      x.lineWidth = 2; x.strokeStyle = '#fff'; x.beginPath(); x.arc(mx, my, 9, 0, 6.2832); x.stroke();
      const c = cur(); prev.style.background = c;
      if (document.activeElement !== hex) hex.value = c.toUpperCase();
    }
    const emit = (fin) => onChange(cur(), fin);
    let down = false;
    const fromEvent = (e) => { const r = sv.getBoundingClientRect(); hsv[1] = U.clamp((e.clientX - r.left) / r.width, 0, 1); hsv[2] = 1 - U.clamp((e.clientY - r.top) / r.height, 0, 1); draw(); emit(false); };
    sv.addEventListener('pointerdown', (e) => { down = true; try { sv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } fromEvent(e); });
    sv.addEventListener('pointermove', (e) => { if (down) fromEvent(e); });
    const end = () => { if (down) { down = false; emit(true); } };
    sv.addEventListener('pointerup', end); sv.addEventListener('pointercancel', end);
    const hue = UI.slider({ min: 0, max: 359, value: Math.round(hsv[0]), cls: 'hue', label: 'Hue', onInput: (v) => { hsv[0] = v; draw(); emit(false); }, onChange: () => emit(true) });
    hex.addEventListener('change', () => {
      const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.value.trim());
      if (!m) { hex.value = cur().toUpperCase(); return; }
      const c = U.hexToRgb(m[1]); hsv = U.rgbToHsv(c[0], c[1], c[2]); hue.set(Math.round(hsv[0])); draw(); emit(true);
    });
    const body = h('div', null, sv, hue, h('div', { class: 'cp-row' }, prev, hex));
    const sh = UI.sheet('Colour', body);
    const done = h('button', { class: 'btn pri wide', type: 'button', text: 'Done', style: 'margin-top:14px' });
    U.onTap(done, () => sh.close());
    body.appendChild(done);
    draw();
    return sh;
  };

  /* ---------- top bar ---------- */
  function renderTop() {
    if (!E.top) return;
    U.clear(E.top);
    if (mode) {
      const mid = h('div', { class: 'top-mid' });
      if (mode.history) {
        const u = tbtn('undo', 'Undo', () => { mode.history.undo(); renderTop(); }); u.disabled = !mode.history.canUndo();
        const r = tbtn('redo', 'Redo', () => { mode.history.redo(); renderTop(); }); r.disabled = !mode.history.canRedo();
        mid.append(u, r);
      } else mid.append(h('span', { class: 'top-title', text: mode.title || '' }));
      E.top.append(tbtn('close', 'Cancel', cancelMode), mid, tbtn('check', 'Apply', applyMode, 'ok'));
      return;
    }
    const u = tbtn('undo', 'Undo', () => History.undo()); u.disabled = !History.canUndo();
    const r = tbtn('redo', 'Redo', () => History.redo()); r.disabled = !History.canRedo();
    E.top.append(tbtn('close', 'Close', closeEditor),
      h('div', { class: 'top-mid' }, u, r, tbtn('download', 'Save picture', () => Exporter.quickSave()), tbtn('more', 'More', moreMenu)),
      tbtn('next', 'Export', () => Exporter.open()));
  }
  UI.refreshTop = renderTop;

  /* ---------- main toolbar + Tools grid ---------- */
  function mainItems() {
    return [
      { id: 'tools', icon: 'tools', label: 'Tools', onTap: () => toggleTools() },
      { id: 'text', icon: 'text', label: 'Text', onTap: () => TextTool.add() },
      { id: 'addphoto', icon: 'addphoto', label: 'Add Photo', onTap: () => PhotoTool.add() },
      { id: 'add', icon: 'apps', label: 'Add', onTap: () => UI.addSheet() },
      { id: 'removebg', icon: 'removebg', label: 'Remove BG', onTap: () => Cutout.open(Doc.selected(), 'auto') },
      { id: 'remove', icon: 'removeobj', label: 'Remove', onTap: () => RemoveTool.open(Doc.selected()) },
      { id: 'replay', icon: 'replay', label: 'Replay', onTap: () => ReplayTool.open() },
      { id: 'fit', icon: 'fit', label: 'Fit', onTap: () => FitTool.open() },
      { id: 'effects', icon: 'effects', label: 'Effects', onTap: () => EffectsTool.open() },
      { id: 'retouch', icon: 'retouch', label: 'Retouch', onTap: () => RetouchTool.open(Doc.selected()) },
      { id: 'sticker', icon: 'sticker', label: 'Sticker', onTap: () => StickerTool.open() },
      { id: 'cutout', icon: 'cutout', label: 'Cutout', onTap: () => Cutout.open(Doc.selected(), 'around') },
      { id: 'brushes', icon: 'brushes', label: 'Brushes', onTap: () => BrushesTool.open() },
      { id: 'border', icon: 'border', label: 'Border', onTap: () => BorderTool.open() },
      { id: 'shape', icon: 'shape', label: 'Shape', onTap: () => ShapeTool.open() },
      { id: 'mask', icon: 'mask', label: 'Mask', onTap: () => MaskTool.open() },
      { id: 'draw', icon: 'draw', label: 'Draw', onTap: () => DrawTool.open() },
      { id: 'lensflare', icon: 'lensflare', label: 'Lens Flare', onTap: () => FlareTool.open() },
      { id: 'shapemask', icon: 'shapemask', label: 'Shape Mask', onTap: () => ShapeMaskTool.open() },
      { id: 'frame', icon: 'frame', label: 'Frame', onTap: () => FrameTool.open() },
      { id: 'callout', icon: 'callout', label: 'Callout', onTap: () => CalloutTool.open() },
      { id: 'apps', icon: 'apps', label: 'Apps', onTap: appsMenu },
      { id: 'myfolders', icon: 'myfolders', label: 'My folders', onTap: () => Folders.menu() }
    ];
  }
  function toolsList() {
    return [
      ['crop', 'Crop', () => CropTool.open()], ['freecrop', 'Free Crop', () => Cutout.open(null, 'around')], ['shapecrop', 'Shape Crop', () => ShapeCrop.open()], ['dispersion', 'Dispersion', () => DispersionTool.open()],
      ['clone', 'Clone', () => CloneTool.open()], ['stretch', 'Stretch', () => StretchTool.open()], ['motion', 'Motion', () => MotionTool.open()], ['selection', 'Selection', () => SelectionTool.open()],
      ['curves', 'Curves', () => CurvesTool.open()], ['adjust', 'Adjust', () => AdjustTool.open()], ['enhance', 'Enhance', () => EnhanceTool.open()], ['tiltshift', 'Tilt Shift', () => TiltShiftTool.open()],
      ['perspective', 'Perspective', () => PerspectiveTool.open()], ['resize', 'Resize', () => ResizeTool.open()], ['fliprotate', 'Flip/Rotate', () => FlipRotateTool.open()]
    ];
  }
  function toggleTools(force) {
    toolsOpen = force == null ? !toolsOpen : force;
    const old = E.stageUi.querySelector('.tools-pop');
    if (old) old.remove();
    const item = E.toolbar.querySelector('.tb-item[data-id="tools"]');
    if (item) item.classList.toggle('active', toolsOpen);
    if (!toolsOpen) return;
    const grid = h('div', { class: 'tools-pop' });
    for (const t of toolsList()) {
      const b = h('button', { class: 'tool-cell' + (t[2] ? '' : ' soon'), type: 'button', 'data-id': t[0] }, I.el(t[0]), h('span', { text: t[1] }));
      U.onTap(b, () => { if (!t[2]) { U.toast(t[1] + ' is coming in a later update'); return; } toggleTools(false); t[2](); });
      grid.appendChild(b);
    }
    E.stageUi.appendChild(grid);
  }

  function refreshContext() {
    if (mode || !Doc.open) return;
    toggleTools(false);
    UI.panelOpenFor = null;
    UI.setPanel(null);
    const l = Doc.selected();
    UI.setToolbar(l ? ObjOpts.items(l) : mainItems());
    updateFab();
    View.request();
  }
  UI.refreshContext = refreshContext;
  function updateFab() {
    if (!E.fab) return;
    E.fab.classList.toggle('hidden', !!mode);
    const n = Doc.layers.length;
    E.fabCnt.textContent = String(n);
  }

  /* ---------- tool modes ---------- */
  /* m: { title, panel, items | bar | noBar, apply(), cancel(), history:{undo,redo,canUndo,canRedo},
          compare:{down,up}, render | drawDoc | overlay, pointerDown/Move/Up/Cancel, tap } */
  UI.enterMode = function (m) {
    toggleTools(false);
    mode = m; View.mode = m;
    UI.panelOpenFor = null;
    renderTop();
    if (m.bar) UI.setToolbarNode(m.bar); else if (m.items) UI.setToolbar(m.items); else UI.setToolbarNode(null);
    UI.setPanel(m.panel || null);
    setCompare(m.compare || null);
    updateFab();
    View.request();
  };
  UI.exitMode = function () {
    mode = null; View.mode = null;
    View.overrides.clear(); View.hide.clear();
    setCompare(null);
    renderTop();
    refreshContext();
  };
  UI.mode = () => mode;
  UI.applyCurrent = () => applyMode();          // the same as the ✓ on the top bar
  async function applyMode() {
    if (!mode || applying) return;
    const m = mode; applying = true;
    try { if (m.apply) await m.apply(); }
    catch (e) { console.error(e); U.toast('Sorry, that did not work: ' + (e && e.message ? e.message : e)); }
    finally { applying = false; }
    if (mode === m) UI.exitMode();
  }
  function cancelMode() {
    if (!mode || applying) return;
    const m = mode;
    if (m.cancel) m.cancel();
    if (mode === m) UI.exitMode();
  }
  UI.applyMode = applyMode; UI.cancelMode = cancelMode;
  function setCompare(c) {
    const old = E.stageUi.querySelector('.fab.left');
    if (old) old.remove();
    if (!c) return;
    const b = h('button', { class: 'fab left', type: 'button', title: 'Hold to see the original', 'aria-label': 'Hold to see the original', html: I.svg('compare', 24) });
    const up = () => c.up();
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } c.down(); });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    E.stageUi.appendChild(b);
  }

  /* ---------- home ---------- */
  function buildHome() {
    U.clear(E.home);
    const big = h('button', { class: 'big-btn', type: 'button', id: 'btn-open' }, I.el('image'), h('span', null, h('b', { text: 'Open Photo' }), h('small', { text: 'Pick a picture from your gallery' })));
    U.onTap(big, openPhoto);
    const card = (id, icon, title, sub, fn, soon) => {
      const b = h('button', { class: 'card' + (soon ? ' soon' : ''), type: 'button', id: id }, I.el(icon), h('span', null, title, h('small', { text: sub, style: 'display:block' })), soon ? h('span', { class: 'soon-tag', text: 'SOON' }) : null);
      U.onTap(b, fn);
      return b;
    };
    E.home.appendChild(h('div', { class: 'home-in' },
      h('div', { class: 'logo', html: I.logo(76) }),
      h('h1', null, h('span', { text: APP_NAME })),
      h('p', { class: 'tag', text: 'Photo editor & designer' }),
      h('div', { id: 'draft-slot' }),
      big,
      h('div', { class: 'row2' },
        card('btn-blank', 'canvas', 'Blank Canvas', 'Start a design', newBlank),
        card('btn-demo', 'sparkle', 'Demo Photo', 'Try the tools', openDemo)),
      h('div', { class: 'row2' },
        card('btn-plp', 'folder', 'Open Project', 'PLP or RongTuli file', openProjectFile),
        card('btn-folders', 'myfolders', 'My folders', 'Saved projects', () => Folders.open())),
      h('div', { class: 'home-foot', text: 'Version ' + APP_VERSION + (Native.on ? ' · Android app' : '') + ' · works without internet' })
    ));
  }
  function showHome() {
    E.editor.classList.add('hidden'); E.home.classList.remove('hidden'); Folders.refreshHome();
    try { if (typeof HomeBar !== 'undefined') HomeBar.refresh(); } catch (e) { /* the strip is a nicety */ }
  }
  function showEditor() {
    E.home.classList.add('hidden'); E.editor.classList.remove('hidden');
    mode = null; View.mode = null; View.overrides.clear(); View.hide.clear();
    renderTop(); refreshContext();
    View.resize(); View.fit();
    armBack();
  }
  UI.showEditor = showEditor; UI.showHome = showHome;

  async function openPhoto() {
    const files = await U.pickFiles('image/*', false);
    if (!files.length) return;
    try {
      await U.busy(async () => { const c = await U.fileToCanvas(files[0], MAX_DIM); Doc.fromCanvas(c); showEditor(); }, 'Opening…');
    } catch (e) { console.error(e); U.toast(e.message || 'Could not open this picture'); }
  }
  UI.openCanvas = function (c) { Doc.fromCanvas(c); showEditor(); };

  /* a project file: PixelLab .plp or our own. Phones do not know these file types, so the picker shows every file. */
  async function openProjectFile() {
    const files = await U.pickFiles('', false);
    if (files.length) await UI.openFile(files[0]);
  }
  UI.openFile = async function (file) {
    let r = null;
    try {
      r = await U.busy(async () => {
        const buf = await U.readAsArrayBuffer(file);
        const kind = Zip.sniff(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
        if (kind === 'png' || kind === 'jpg' || kind === 'webp' || kind === 'gif') return { photo: await U.fileToCanvas(file, MAX_DIM) };
        if (kind !== 'zip') throw new Error('This is not a project file. Choose a PixelLab .plp file or a ' + APP_NAME + ' project (' + Project.EXT + ').');
        const zip = Zip.open(buf);
        const name = String(file.name || '').replace(/\.[a-z0-9]{2,9}$/i, '');
        if (Project.is(zip)) {
          const d = await Project.read(zip, (done, total) => U.busyLabel('Opening… ' + done + ' / ' + total));
          if (!d.name) d.name = name;
          return { doc: d };
        }
        if (PLP.is(zip)) {
          const d = await PLP.read(zip, (done, total) => U.busyLabel('Opening… ' + done + ' / ' + total));
          d.name = name;
          return { doc: d, plp: true };
        }
        throw new Error('This zip file is not a project that ' + APP_NAME + ' knows (it is neither a PixelLab .plp nor a ' + Project.EXT + ' file).');
      }, 'Opening…');
    } catch (e) { console.error(e); U.toast(e && e.message ? e.message : 'Could not open this file', 3600); return false; }
    if (r.photo) { Doc.fromCanvas(r.photo); showEditor(); return true; }
    Doc.load(r.doc); showEditor();
    if (r.plp) plpReport(r.doc);
    else if (r.doc.notes && r.doc.notes.length) U.toast(r.doc.notes[0], 3800);
    return true;
  };
  function plpReport(d) {
    const c = d.counts || { text: 0, picture: 0, skipped: 0 };
    let head = 'Opened ' + c.text + ' text' + (c.text === 1 ? '' : 's') + ' and ' + c.picture + ' picture' + (c.picture === 1 ? '' : 's') + (c.skipped ? ' (' + c.skipped + ' skipped)' : '') + '.';
    if (d.fonts && d.fonts.length) head += ' The ' + (d.fonts.length === 1 ? 'font' : d.fonts.length + ' fonts') + ' inside the file ' + (d.fonts.length === 1 ? 'is' : 'are') + ' now in Text → Font for your own words too.';
    if (!d.notes || !d.notes.length) { U.toast(head, 2600); return; }
    const list = h('ul', { class: 'notes' });
    for (const n of d.notes) list.appendChild(h('li', { text: n }));
    const ok = h('button', { class: 'btn pri wide', type: 'button', text: 'OK', id: 'btn-plp-ok' });
    const sh = UI.sheet('Opened from PixelLab', h('div', null, h('p', { class: 'notes-h', text: head }), h('p', { class: 'notes-h dim', text: 'A few things look different here than in PixelLab:' }), list, ok));
    U.onTap(ok, () => sh.close());
  }

  function newBlank() {
    const SIZES = [['Square', 1080, 1080, '1:1'], ['Portrait', 1080, 1350, '4:5'], ['Story', 1080, 1920, '9:16'], ['Landscape', 1920, 1080, '16:9'], ['Poster', 1500, 2000, '3:4'], ['Banner', 1640, 924, 'Facebook cover']];
    let pick = SIZES[0], color = '#ffffff';
    const grid = h('div', { class: 'size-grid' });
    for (const s of SIZES) {
      const b = h('button', { class: 'size-opt' + (s === pick ? ' on' : ''), type: 'button' }, h('b', { text: s[0] + ' · ' + s[3] }), h('small', { text: s[1] + ' × ' + s[2] + ' px' }));
      U.onTap(b, () => { pick = s; for (const c of grid.children) c.classList.remove('on'); b.classList.add('on'); });
      grid.appendChild(b);
    }
    const pal = UI.palette({ value: color, none: true, onPick: (c) => { color = c; }, onNone: () => { color = null; } });
    const go = h('button', { class: 'btn pri wide', type: 'button', text: 'Create', id: 'btn-create' });
    const sh = UI.sheet('Blank Canvas', h('div', null, h('div', { class: 'sub-h', text: 'Size' }), grid, h('div', { class: 'sub-h', text: 'Background' }), pal, go));
    U.onTap(go, () => { sh.close(); Doc.blank(pick[1], pick[2], color); showEditor(); });
  }

  /* a drawn sunset, so every tool can be tried without picking a file */
  function demoCanvas() {
    const W = 1600, H = 1200, c = U.canvas(W, H), x = c.getContext('2d'), r = U.rng(5), hz = H * 0.62;
    let g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#16235f'); g.addColorStop(.42, '#6f3b9c'); g.addColorStop(.74, '#ef6a5b'); g.addColorStop(1, '#ffc56e');
    x.fillStyle = g; x.fillRect(0, 0, W, hz);
    for (let i = 0; i < 110; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.65) + ')'; x.beginPath(); x.arc(r() * W, r() * H * 0.36, 0.7 + r() * 1.7, 0, 6.2832); x.fill(); }
    const sx = W * 0.62, sy = H * 0.5;
    g = x.createRadialGradient(sx, sy, 8, sx, sy, 360);
    g.addColorStop(0, 'rgba(255,248,214,1)'); g.addColorStop(.17, 'rgba(255,228,150,1)'); g.addColorStop(.2, 'rgba(255,196,110,.55)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, hz);
    for (let i = 0; i < 9; i++) {
      const cx = r() * W, cy = H * (0.2 + r() * 0.26), cw = 150 + r() * 260;
      g = x.createRadialGradient(cx, cy, 4, cx, cy, cw);
      g.addColorStop(0, 'rgba(255,190,200,.36)'); g.addColorStop(1, 'rgba(255,190,200,0)');
      x.save(); x.translate(cx, cy); x.scale(1, 0.24); x.translate(-cx, -cy); x.fillStyle = g; x.fillRect(cx - cw, cy - cw, cw * 2, cw * 2); x.restore();
    }
    const ridge = (base, amp, color, seed) => {
      const q = U.rng(seed); x.fillStyle = color; x.beginPath(); x.moveTo(0, H);
      let y = base;
      for (let px = 0; px <= W + 36; px += 36) { y = U.clamp(y + (q() - 0.5) * amp, base - amp * 2.4, base + amp * 1.1); x.lineTo(px, y); }
      x.lineTo(W + 36, H); x.closePath(); x.fill();
    };
    ridge(H * 0.51, 50, '#5a3080', 11); ridge(H * 0.565, 40, '#3a1f60', 23);
    g = x.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#f5a070'); g.addColorStop(.22, '#93508f'); g.addColorStop(1, '#121842');
    x.fillStyle = g; x.fillRect(0, hz, W, H - hz);
    for (let i = 0; i < 74; i++) {
      const yy = hz + 6 + i * 6, ww = 50 + r() * 240 * (1 - i / 95);
      x.fillStyle = 'rgba(255,224,160,' + (0.55 * (1 - i / 80)) + ')';
      x.fillRect(sx - ww / 2 + (r() - 0.5) * 46, yy, ww, 2.6);
    }
    ridge(H * 0.9, 34, '#0b0f2c', 31);
    return c;
  }
  function openDemo() { Doc.fromCanvas(demoCanvas()); showEditor(); }
  UI.demoCanvas = demoCanvas;

  /* leave the editor. A saved project is brought up to date first; other work is offered a place in My folders. */
  let closing = false;
  async function closeEditor() {
    if (closing || !Doc.open) return;
    closing = true;
    try {
      if (Doc.pid) {
        try { await Folders.finish(); }
        catch (e) {
          console.error(e);
          const go = await UI.confirm('The project could not be saved', (e && e.message ? e.message : 'The storage did not work.') + ' Leave without saving the last changes?', 'Leave', 'Stay');
          if (!go) return;
        }
      } else if (Folders.unsaved()) {
        const a = await UI.choose('Save this as a project?', 'A project in My folders can be opened again later with every layer and text still editable. (The finished picture is saved with the download button.)',
          [['stay', 'Keep editing'], ['no', 'Don\u2019t save'], ['save', 'Save project', true]]);
        if (a === 'stay') return;
        if (a === 'save' && !(await Folders.saveDialog())) return;
      }
      Folders.forget();
      Doc.close(); showHome();
    } finally { closing = false; }
  }
  UI.closeEditor = closeEditor;

  function moreMenu() {
    const sh = UI.sheet('More', null);
    const row = (icon, label, fn) => {
      const b = h('button', { class: 'row-btn', type: 'button' }, I.el(icon), h('span', { text: label }));
      U.onTap(b, () => { sh.close(); fn(); });
      return b;
    };
    sh.body.append(
      row('layers', 'Layers', () => LayersPanel.open()),
      row('save', Doc.pid ? 'Project (saved in My folders)' : 'Save project', () => Folders.menu()),
      row('color', 'Background colour', bgSheet),
      row('fitscreen', 'Fit to screen', () => View.fit()),
      row('download', 'Save as PNG', () => Exporter.save('png')),
      row('download', 'Save as JPG', () => Exporter.save('jpg')),
      row('next', 'Check for updates', async () => {
        U.toast('Looking…', 900);
        const u = await Updater.check(true);
        if (u) Updater.open(u); else U.toast('You have the newest version (' + APP_VERSION + ')');
      }),
      row('home', 'Back to home', closeEditor));
  }
  /* Apps: one screen with shortcuts to the tools used most */
  function appsMenu() {
    const sh = UI.sheet('Apps', null);
    const grid = h('div', { class: 'apps-grid' });
    const cell = (icon, label, fn) => {
      const b = h('button', { class: 'app-cell', type: 'button', 'data-id': icon }, I.el(icon), h('span', { text: label }));
      U.onTap(b, () => { sh.close(); fn(); });
      grid.appendChild(b);
    };
    cell('crop', 'Crop', () => CropTool.open());
    cell('fliprotate', 'Flip/Rotate', () => FlipRotateTool.open());
    cell('resize', 'Resize', () => ResizeTool.open());
    cell('adjust', 'Adjust', () => AdjustTool.open());
    cell('curves', 'Curves', () => CurvesTool.open());
    cell('effects', 'Effects', () => EffectsTool.open());
    cell('text', 'Text', () => TextTool.add());
    cell('sticker', 'Sticker', () => StickerTool.open());
    cell('addphoto', 'Add Photo', () => PhotoTool.add());
    cell('draw', 'Draw', () => DrawTool.open());
    cell('layers', 'Layers', () => LayersPanel.open());
    cell('color', 'Background', bgSheet);
    cell('fit', 'Fit', () => FitTool.open());
    sh.body.append(grid, h('p', { class: 'panel-note', text: 'Shortcuts to the tools used most. Everything else is in the bar below and under Tools.' }));
  }
  /* the sheet from the video: Shape / Text / Sticker / Add Photo / Background in one place.
     Shape is a crop (the picture is cut to the shape), not a coloured shape of its own. */
  UI.addSheet = function addSheet() {
    const grid = h('div', { class: 'apps-grid' });
    const cell = (icon, label, fn) => {
      const b = h('button', { class: 'apps-cell', type: 'button' }, I.el(icon, 26), h('small', { text: label }));
      U.onTap(b, fn);
      grid.appendChild(b);
      return b;
    };
    const sh = UI.sheet('Add', grid);
    const go = (fn) => () => { sh.close(); fn(); };
    cell('shape', 'Shape', go(() => ShapeTool.open()));
    cell('text', 'Text', go(() => TextTool.add()));
    cell('sticker', 'Sticker', go(() => StickerTool.open()));
    cell('addphoto', 'Add Photo', go(() => PhotoTool.add()));
    cell('paint', 'Draw', go(() => DrawTool.open()));
    cell('color', 'Background', go(() => bgSheet()));
    cell('fit', 'Fit', go(() => FitTool.open()));
    cell('preset', 'Style presets', go(() => TextTool.add()));
  };
  function bgSheet() {
    const pal = UI.palette({
      value: Doc.bg.type === 'color' ? Doc.bg.color : 'none', none: true,
      onPick: (c, fin) => { Doc.bg = { type: 'color', color: c }; View.request(); if (fin) History.commit(); },
      onNone: () => { Doc.bg = { type: 'none', color: '#ffffff' }; View.request(); History.commit(); }
    });
    UI.sheet('Background colour', h('div', null, pal, h('p', { class: 'panel-note', text: 'Shows wherever no photo covers the canvas.' })));
  }

  /* ---------- the phone's Back button: close the top-most thing instead of leaving the page ---------- */
  function armBack() {
    if (backArmed) return;
    try { history.pushState({ rt: 1 }, ''); backArmed = true; } catch (e) { /* not allowed here: Back simply leaves */ }
  }
  /* full-screen pages shown over the home screen or the editor (My folders): Back closes the top one. Returns a function to call when the page is gone. */
  const overlays = [];
  UI.overlay = function (close) {
    const o = { close: close };
    overlays.push(o); armBack();
    return () => { const i = overlays.indexOf(o); if (i >= 0) overlays.splice(i, 1); };
  };
  function onBack() {
    if (!backArmed) return;
    backArmed = false;
    const inEditor = Doc.open && !E.editor.classList.contains('hidden');
    const te = document.querySelector('.te');
    const dlgs = E.sheets.querySelectorAll('.backdrop.center');
    const dlg = dlgs.length ? dlgs[dlgs.length - 1].querySelector('.dialog .btn:not(.pri)') : null;       // the top-most question: its "no" answer
    if (!inEditor && !overlays.length && !openSheets.length && !dlg && !te) return;
    armBack();
    if (te) { te.remove(); return; }
    if (dlg) { dlg.click(); return; }
    if (openSheets.length) { openSheets[openSheets.length - 1].close(); return; }
    if (overlays.length) { overlays[overlays.length - 1].close(); return; }
    if (!inEditor) return;
    if (applying) return;
    if (toolsOpen) { toggleTools(false); return; }
    if (mode) { cancelMode(); return; }
    if (UI.panelOpenFor) { UI.panelOpenFor = null; UI.setPanel(null); UI.markActive(null); return; }
    if (Doc.selectedId) { Doc.select(null); return; }
    closeEditor();
  }

  /* ---------- start ---------- */
  UI.init = function () {
    E.home = U.$('#home'); E.editor = U.$('#editor'); E.top = U.$('#topbar'); E.stage = U.$('#stage'); E.stageUi = U.$('#stage-ui');
    E.panel = U.$('#panel'); E.toolbar = U.$('#toolbar'); E.sheets = U.$('#sheets');
    View.init(E.stage, U.$('#view'));
    E.fabCnt = h('span', { class: 'cnt', text: '0' });
    E.fab = h('button', { class: 'fab', type: 'button', title: 'Layers', 'aria-label': 'Layers', id: 'fab-layers', html: I.svg('layers', 24) }, E.fabCnt);
    U.onTap(E.fab, () => LayersPanel.open());
    E.stageUi.appendChild(E.fab);
    buildHome();

    U.on('select', refreshContext);
    U.on('history', () => { if (!mode) renderTop(); updateFab(); });
    U.on('doc', () => { View.request(); updateFab(); });
    U.on('stagetap', () => { if (toolsOpen) toggleTools(false); });
    U.on('edittext', (id) => { const l = Doc.get(id); if (l) TextTool.edit(l); });

    window.addEventListener('keydown', (e) => {
      if (!Doc.open || E.editor.classList.contains('hidden')) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const meta = e.ctrlKey || e.metaKey;
      if (mode) { if (e.key === 'Escape') cancelMode(); else if (e.key === 'Enter') applyMode(); return; }
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) History.redo(); else History.undo(); return; }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); History.redo(); return; }
      const l = Doc.selected();
      if (!l || l.locked) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); Doc.remove(l.id); History.commit(); View.request(); }
      else if (e.key.indexOf('Arrow') === 0) {
        e.preventDefault();
        const d = (e.shiftKey ? 10 : 1) / View.scale;
        if (e.key === 'ArrowLeft') l.x -= d; else if (e.key === 'ArrowRight') l.x += d; else if (e.key === 'ArrowUp') l.y -= d; else l.y += d;
        View.request(); History.commit();
      } else if (e.key === 'Escape') Doc.select(null);
    });
    window.addEventListener('popstate', onBack);
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('beforeunload', (e) => { if (Doc.open && !U.sandboxed() && Folders.pending()) { Folders.flush().catch(() => { }); e.preventDefault(); e.returnValue = ''; } });
  };
})();
