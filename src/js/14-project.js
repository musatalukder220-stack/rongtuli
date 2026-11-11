'use strict';
/* ============================================================
 * 14-project.js : RongTuli's own project file (".rongtuli").
 * A project keeps every layer apart, so texts stay editable and
 * pictures can still be moved after it is opened again.
 *
 * The file is a ZIP (stored, not compressed):
 *   project.json        size, background, list of layers (bottom first), fonts
 *   layers/N.png|jpg    the picture of each image layer (one file per picture, shared by copies)
 *   fonts/N             font files the user added that the texts use
 *   thumb.jpg           small preview
 * ============================================================ */
const Project = {};
(function () {
  Project.EXT = '.rongtuli';
  Project.FORMAT = 1;
  const MAX_SIDE = 8192;

  /* Pictures never change after they are made (every edit makes a new canvas), so a picture packed once
     can be reused on every later save: saving again only packs what is new. */
  const packed = new WeakMap();          // canvas -> { data: Uint8Array, ext, crc, w, h }

  const toBlob = (c, type, q) => new Promise((res, rej) => {
    try { c.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not pack a picture'))), type, q); } catch (e) { rej(e); }
  });
  /* 'png' for pictures with see-through parts and for flat drawings (smaller and exact), 'jpg' for photos */
  function kindOf(c) {
    const w = c.width, h = c.height, x = c.getContext('2d');
    let same = 0, pairs = 0;
    for (let y = 0; y < h; y += 256) {
      const u = new Uint32Array(x.getImageData(0, y, w, Math.min(256, h - y)).data.buffer), n = u.length;
      for (let i = 0; i < n; i++) if ((u[i] >>> 24) !== 255) return 'png';
      for (let i = 0; i + 1 < n; i += 7) { pairs++; if (u[i] === u[i + 1]) same++; }
    }
    return pairs && same / pairs > 0.5 ? 'png' : 'jpg';
  }
  async function pack(c) {
    let e = packed.get(c);
    if (e && e.w === c.width && e.h === c.height) return e;
    const ext = kindOf(c);
    const blob = await toBlob(c, ext === 'jpg' ? 'image/jpeg' : 'image/png', ext === 'jpg' ? 0.94 : undefined);
    const data = new Uint8Array(await blob.arrayBuffer());
    e = { data: data, ext: ext, crc: Zip.crc32(data), w: c.width, h: c.height };
    packed.set(c, e);
    return e;
  }
  const b64ToBytes = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  /* a small picture of the open document, as a JPEG data: address */
  Project.thumb = function (maxDim) {
    const c = Doc.flatten({ fill: '#ffffff', maxDim: maxDim || 360 });
    return c.toDataURL('image/jpeg', 0.8);
  };

  function plain(l) {
    const o = {};
    for (const k in l) if (k !== 'bitmap' && k !== 'id' && k.charAt(0) !== '_') o[k] = l[k];
    return JSON.parse(JSON.stringify(o));
  }

  /* Pack the open document. o: { name, progress(done, total) }
     -> { blob, thumb (data: address), width, height, count }.
     Everything is read from the document before the first pause, so editing may go on while the pictures are packed. */
  Project.pack = async function (o) {
    o = o || {};
    if (!Doc.open) throw new Error('Nothing is open');
    const width = Doc.width, height = Doc.height, bg = Object.assign({}, Doc.bg), name = o.name != null ? o.name : (Doc.name || '');
    const src = Doc.layers.slice(), thumb = Project.thumb();
    const layers = src.map(plain), bmp = src.map((l) => (l.type === 'image' ? l.bitmap : null));
    const fontsUsed = new Set();
    for (const l of src) if (l.type === 'text') { fontsUsed.add(l.font); if (l.spans) for (const q of l.spans) if (q.font) fontsUsed.add(q.font); }
    const pics = [];                               // distinct pictures, in order
    for (const c of bmp) if (c && pics.indexOf(c) < 0) pics.push(c);
    const pin = new Set(pics);
    History.pinned.add(pin);                       // keep undo from recycling these pictures while they are being packed
    const files = [];
    try {
      const fileOf = new Map();
      let done = 0;
      for (const c of pics) {
        const e = await pack(c);
        const f = { name: 'layers/' + fileOf.size + '.' + e.ext, data: e.data, crc: e.crc };
        fileOf.set(c, f); files.push(f);
        if (o.progress) o.progress(++done, pics.length);
      }
      bmp.forEach((c, i) => { if (c) { const e = packed.get(c); layers[i].src = fileOf.get(c).name; layers[i].w = e.w; layers[i].h = e.h; } });
    } finally { History.pinned.delete(pin); }
    const fonts = [];
    for (const fam of fontsUsed) {
      const buf = Fonts.custom[fam];
      if (!buf) continue;
      const f = { name: 'fonts/' + fonts.length, data: new Uint8Array(buf) };
      files.push(f); fonts.push({ family: fam, file: f.name });
    }
    const json = {
      app: APP_NAME, format: Project.FORMAT, version: APP_VERSION, name: name, saved: new Date().toISOString(),
      width: width, height: height, bg: bg, layers: layers, fonts: fonts
    };
    files.unshift({ name: 'project.json', data: JSON.stringify(json) });
    files.push({ name: 'thumb.jpg', data: b64ToBytes(thumb.slice(thumb.indexOf(',') + 1)) });
    const blob = await Zip.make(files, 'application/octet-stream');
    return { blob: blob, thumb: thumb, width: width, height: height, count: layers.length };
  };

  Project.is = (zip) => zip.has('project.json');

  async function toCanvas(bytes) {
    const kind = Zip.sniff(bytes);
    if (kind !== 'png' && kind !== 'jpg' && kind !== 'webp' && kind !== 'gif') throw new Error('not a picture');
    const blob = new Blob([bytes], { type: kind === 'png' ? 'image/png' : kind === 'jpg' ? 'image/jpeg' : kind === 'webp' ? 'image/webp' : 'image/gif' });
    let im = null;
    if (typeof createImageBitmap === 'function') { try { im = await createImageBitmap(blob); } catch (e) { im = null; } }
    let url = null;
    if (!im) { url = URL.createObjectURL(blob); try { im = await U.loadImage(url); } catch (e) { URL.revokeObjectURL(url); throw e; } }
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (!w || !h) throw new Error('empty picture');
    const k = Math.min(1, 4096 / Math.max(w, h));
    const c = U.canvas(w * k, h * k), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(im, 0, 0, c.width, c.height);
    if (im.close) im.close();
    if (url) URL.revokeObjectURL(url);
    if (k === 1 && (kind === 'png' || kind === 'jpg')) {
      const data = bytes.slice();                  // own copy: lets the big file buffer go
      packed.set(c, { data: data, ext: kind, crc: Zip.crc32(data), w: c.width, h: c.height });
    }
    return c;
  }
  const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : d; };
  const NOT_KEPT = { type: 1, id: 1, src: 1, w: 1, h: 1, bitmap: 1, constructor: 1, prototype: 1 };

  /* Read a project. -> { width, height, bg, layers, name, notes[] } ready for Doc.load().
     progress(done, total) is called while the pictures are unpacked. */
  Project.read = async function (zip, progress) {
    let j;
    try { j = JSON.parse(await zip.text('project.json')); } catch (e) { throw new Error('This project file is damaged (its list of layers cannot be read)'); }
    if (!j || typeof j !== 'object' || !Array.isArray(j.layers)) throw new Error('This is not a ' + APP_NAME + ' project file');
    const W = Math.round(num(j.width, 0)), H = Math.round(num(j.height, 0));
    if (!(W >= 1 && H >= 1)) throw new Error('This project file is damaged (it has no size)');
    if (W > MAX_SIDE || H > MAX_SIDE) throw new Error('This project is too large to open here (' + W + ' × ' + H + ' px)');
    const notes = [];
    if (num(j.format, 1) > Project.FORMAT) notes.push('This project was made with a newer version of ' + APP_NAME + '; some things may look different');

    /* fonts the user had added: load them, and follow the name each one gets here */
    const rename = {};
    for (const f of Array.isArray(j.fonts) ? j.fonts : []) {
      if (!f || !f.family || !f.file) continue;
      try {
        const fam = await Fonts.addData(await zip.get(String(f.file)), String(f.family), false);
        if (fam !== f.family) rename[f.family] = fam;
      } catch (e) { notes.push('The font “' + f.family + '” could not be loaded; another font is shown instead'); }
    }
    const fontName = (fam) => (fam != null && rename[fam] ? rename[fam] : fam);

    const pics = new Map();
    const total = new Set(j.layers.filter((l) => l && l.type === 'image' && l.src).map((l) => l.src)).size;
    let done = 0, lost = 0;
    const layers = [];
    for (const l of j.layers) {
      if (!l || typeof l !== 'object') continue;
      const p = {};
      for (const key of Object.keys(l)) if (key.charAt(0) !== '_' && !NOT_KEPT[key]) p[key] = l[key];
      for (const key of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity']) if (key in p) p[key] = num(p[key], key === 'scaleX' || key === 'scaleY' || key === 'opacity' ? 1 : 0);
      for (const key of ['visible', 'locked', 'flipH', 'flipV']) if (key in p) p[key] = !!p[key];
      if (l.type === 'image') {
        const srcName = String(l.src || '');
        let c = pics.get(srcName);
        if (c === undefined) {
          try { c = await toCanvas(await zip.get(srcName)); } catch (e) { c = null; }
          pics.set(srcName, c);
          if (progress) progress(++done, total);
        }
        if (!c) { lost++; continue; }
        const want = num(l.w, c.width);            // the picture was shrunk while opening: keep its size on the page
        if (want > c.width + 0.5) { const s = want / c.width; p.scaleX = num(p.scaleX, 1) * s; p.scaleY = num(p.scaleY, 1) * s; }
        layers.push(Layers.image(c, p));
      } else if (l.type === 'text') {
        delete p.text;
        if (p.font != null) p.font = fontName(String(p.font));
        p.spans = Array.isArray(p.spans) ? p.spans.filter((q) => q && typeof q === 'object').map((q) => (q.font ? Object.assign({}, q, { font: fontName(String(q.font)) }) : q)) : null;
        if (!p.spans || !p.spans.length) p.spans = null;
        const t = Layers.text(String(l.text == null ? '' : l.text), {});
        for (const key of Object.keys(p)) {
          const v = p[key], d = t[key];
          // stroke / shadow / highlight: a file from an older version may lack newer settings, so start from today's defaults
          if (d && typeof d === 'object' && !Array.isArray(d)) { if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(d, v); }
          else t[key] = v;
        }
        t.size = U.clamp(num(t.size, 100), 1, 4000);
        layers.push(t);
      }
    }
    if (lost) notes.push(lost + (lost === 1 ? ' picture is' : ' pictures are') + ' missing from the file and could not be shown');
    const bg = j.bg && typeof j.bg === 'object' && j.bg.type === 'color' && /^#[0-9a-f]{3,8}$/i.test(String(j.bg.color)) ? { type: 'color', color: String(j.bg.color) } : { type: 'none', color: '#ffffff' };
    return { width: W, height: H, bg: bg, layers: layers, name: typeof j.name === 'string' ? j.name.slice(0, 80) : '', notes: notes };
  };

  /* a name that is safe as a file name on phones and computers */
  Project.fileName = function (name) {
    const s = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').slice(0, 60);
    return (s || 'project') + Project.EXT;
  };
})();
