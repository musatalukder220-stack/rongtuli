'use strict';
/* ============================================================
 * 13-plp.js : open PixelLab project files (.plp)
 * What is known about the format is written down in docs/plp-format.md.
 * A .plp is a zip: data.plab (JSON) + /res/XXXX (pictures and fonts).
 * Every picture / shape becomes an image layer, every text a text layer.
 * ============================================================ */
const PLP = {};
(function () {
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d || 0); };
  /* Android colour number (ARGB, signed) -> { hex '#rrggbb', a 0..1, css } */
  function argb(v) {
    const n = (Number(v) | 0) >>> 0, a = (n >>> 24) / 255, r = (n >>> 16) & 255, g = (n >>> 8) & 255, b = n & 255;
    const hex = U.rgbToHex(r, g, b);
    return { hex: hex, a: a, css: a >= 0.999 ? hex : 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')' };
  }
  /* "v2;3;50/0/50/100;-3355444/-12303292;0.0/1.0" -> {x0,y0,x1,y1,stops,radial} (see Layers.gradient) */
  function parseGrad(str) {
    const p = String(str || '').split(';');
    if (p.length < 5) return null;
    const xy = p[2].split('/').map((v) => num(v) / 100), cols = p[3].split('/'), pos = p[4].split('/');
    if (xy.length < 4 || cols.length < 2) return null;
    const stops = cols.map((c, i) => [U.clamp(num(pos[i], i / (cols.length - 1)), 0, 1), argb(c).css]).sort((a, b) => a[0] - b[0]);
    return { x0: xy[0], y0: xy[1], x1: xy[2], y1: xy[3], stops: stops, radial: p[1] === '4' };
  }
  PLP.argb = argb; PLP.parseGrad = parseGrad;

  async function decode(bytes) {
    const kind = Zip.sniff(bytes);
    const blob = new Blob([bytes], { type: kind === 'png' ? 'image/png' : kind === 'jpg' ? 'image/jpeg' : kind === 'webp' ? 'image/webp' : '' });
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(blob); } catch (e) { /* try the other way */ }
    }
    const url = URL.createObjectURL(blob);
    try { return await U.loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 4000); }
  }
  const resName = (src) => { const p = src && src.imgSrcPath ? String(src.imgSrcPath) : ''; const i = p.lastIndexOf('/'); return p ? p.slice(i + 1) : ''; };
  function findRes(zip, name) {
    if (!name) return null;
    for (const c of ['/res/' + name, 'res/' + name, name]) if (zip.has(c)) return c;
    return null;
  }
  const ctx2 = (c, read) => c.getContext('2d', read ? { willReadFrequently: true } : undefined);

  /* ---------- picture operations (each returns a new canvas) ---------- */
  /* make one colour see-through. tol: PixelLab's 0..1000 */
  function removeColor(c, color, tol) {
    const x = ctx2(c, true), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    const t = U.hexToRgb(color), lim = U.clamp(tol, 0, 1000) / 1000 * 441.7, soft = Math.max(6, lim * 0.12), lo = lim - soft / 2;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const dr = d[i] - t[0], dg = d[i + 1] - t[1], db = d[i + 2] - t[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= lo) d[i + 3] = 0;
      else if (dist < lo + soft) d[i + 3] = Math.round(d[i + 3] * (dist - lo) / soft);
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  /* paint every visible pixel with one colour or gradient, keeping the transparency */
  function overlay(c, fill) {
    const o = U.canvas(c.width, c.height), x = o.getContext('2d');
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = typeof fill === 'string' ? fill : Layers.gradient(x, fill, 0, 0, c.width, c.height);
    x.fillRect(0, 0, c.width, c.height);
    return o;
  }
  /* outline of width s (px) around the visible part. Returns {canvas, m} (m = margin added on every side) */
  function outline(c, s, color) {
    const m = Math.ceil(s) + 1, o = U.canvas(c.width + 2 * m, c.height + 2 * m), x = o.getContext('2d');
    const sil = overlay(c, color);
    const steps = Math.max(12, Math.ceil(2 * Math.PI * s / 1.2));
    for (let i = 0; i < steps; i++) { const a = i / steps * 2 * Math.PI; x.drawImage(sil, m + Math.cos(a) * s, m + Math.sin(a) * s); }
    if (s > 3) for (let i = 0; i < steps; i++) { const a = (i + 0.5) / steps * 2 * Math.PI; x.drawImage(sil, m + Math.cos(a) * s * 0.55, m + Math.sin(a) * s * 0.55); }
    x.drawImage(c, m, m);
    return { canvas: o, m: m };
  }
  function dropShadow(c, color, blur, dx, dy) {
    const m = Math.ceil(blur * 1.6 + Math.max(Math.abs(dx), Math.abs(dy))) + 2, o = U.canvas(c.width + 2 * m, c.height + 2 * m), x = o.getContext('2d');
    x.shadowColor = color; x.shadowBlur = blur; x.shadowOffsetX = dx; x.shadowOffsetY = dy;
    x.drawImage(c, m, m);
    return { canvas: o, m: m };
  }
  /* pull the four corners of the picture to new places. q = [[x,y]×4] (TL, TR, BR, BL) in px of c. Returns {canvas, ox, oy} */
  function warp(c, q) {
    const sw = c.width, sh = c.height;
    const x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, cc, d, e, f, g, h;
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9 || Math.abs(det) < 1e-9) { a = x1 - x0; b = x2 - x1; cc = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0; }
    else {
      g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det;
      a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; cc = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
    }
    // inverse of [[a,b,cc],[d,e,f],[g,h,1]]
    const A = e - f * h, B = cc * h - b, C = b * f - cc * e, D = f * g - d, E = a - cc * g, F = cc * d - a * f, G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
    const minX = Math.floor(Math.min(x0, x1, x2, x3)) - 1, minY = Math.floor(Math.min(y0, y1, y2, y3)) - 1;
    const ow = Math.max(1, Math.ceil(Math.max(x0, x1, x2, x3)) + 1 - minX), oh = Math.max(1, Math.ceil(Math.max(y0, y1, y2, y3)) + 1 - minY);
    if (ow * oh > 9e6) return null;
    const src = ctx2(c, true).getImageData(0, 0, sw, sh).data;
    const o = U.canvas(ow, oh), ox = o.getContext('2d'), im = ox.createImageData(ow, oh), dst = im.data;
    for (let py = 0; py < oh; py++) {
      const Y = py + minY + 0.5;
      for (let px = 0; px < ow; px++) {
        const X = px + minX + 0.5, w = G * X + H * Y + I;
        if (Math.abs(w) < 1e-12) continue;
        const u = (A * X + B * Y + C) / w * sw - 0.5, v = (D * X + E * Y + F) / w * sh - 0.5;
        if (u <= -1 || v <= -1 || u >= sw || v >= sh) continue;
        const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
        let r = 0, gg = 0, bb = 0, al = 0;
        for (let k = 0; k < 4; k++) {
          const sx = iu + (k & 1), sy = iv + (k >> 1);
          if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
          const wgt = ((k & 1) ? fu : 1 - fu) * ((k >> 1) ? fv : 1 - fv), si = (sy * sw + sx) * 4, sa = src[si + 3] * wgt;
          r += src[si] * sa; gg += src[si + 1] * sa; bb += src[si + 2] * sa; al += sa;
        }
        if (al <= 0) continue;
        const di = (py * ow + px) * 4;
        dst[di] = r / al; dst[di + 1] = gg / al; dst[di + 2] = bb / al; dst[di + 3] = al;
      }
    }
    ox.putImageData(im, 0, 0);
    return { canvas: o, ox: minX, oy: minY };
  }
  /* PixelLab's eraser. Every finger stroke is kept as a path, in px of the screen it was drawn on;
     Ea = [left, top, right, bottom] is where the picture was on that screen. Returns true if a soft edge was asked for. */
  function erase(c, masks) {
    const x = c.getContext('2d');
    let soft = false;
    x.save();
    x.globalCompositeOperation = 'destination-out'; x.lineCap = 'round'; x.lineJoin = 'round'; x.fillStyle = '#000'; x.strokeStyle = '#000';
    for (const key of Object.keys(masks).sort((a, b) => num(a) - num(b))) {
      const m = masks[key], ea = m && Array.isArray(m.Ea) ? m.Ea.map((v) => num(v)) : [], p = m && m.PtD && m.PtD.PtD;
      if (ea.length < 4 || !Array.isArray(p) || !(ea[2] > ea[0]) || !(ea[3] > ea[1])) continue;
      const sx = c.width / (ea[2] - ea[0]), sy = c.height / (ea[3] - ea[1]), sm = (sx + sy) / 2;
      const X = (v) => (num(v) - ea[0]) * sx, Y = (v) => (num(v) - ea[1]) * sy;
      if (num(m.Eb) > 0) soft = true;
      x.lineWidth = Math.max(0.5, num(m.Ew, 10) * sm);
      x.beginPath();
      let i = 0, started = false, segs = 0;
      const dots = [];
      while (i < p.length) {
        const cmd = p[i];
        if (cmd === 'f') i += 2;
        else if (cmd === 'l') { if (!started || p[i + 1] === '1') x.moveTo(X(p[i + 2]), Y(p[i + 3])); else { x.lineTo(X(p[i + 2]), Y(p[i + 3])); segs++; } started = true; i += 4; }
        else if (cmd === 'q') { x.quadraticCurveTo(X(p[i + 2]), Y(p[i + 3]), X(p[i + 4]), Y(p[i + 5])); segs++; i += 6; }
        else if (cmd === 'c') { dots.push([X(p[i + 1]), Y(p[i + 2]), Math.max(0.5, num(p[i + 3]) * sm)]); i += 4; }
        else i++;
      }
      if (segs) { if (m.Ef) x.fill(); else x.stroke(); }
      for (const d of dots) { x.beginPath(); x.arc(d[0], d[1], d[2], 0, Math.PI * 2); x.fill(); }
    }
    x.restore();
    return soft;
  }
  /* PixelLab's "cut a part away with a curve": closed curves, 3 points per corner (corner, handle, handle),
     in px of the screen; BcR2 = where the picture was on that screen. What is inside the curve is removed. */
  function cutCurves(c, d) {
    const r = Array.isArray(d.BcR2) ? d.BcR2.map((v) => num(v)) : [];
    if (r.length < 4 || !(r[2] > r[0]) || !(r[3] > r[1])) return false;
    const x = c.getContext('2d'), sx = c.width / (r[2] - r[0]), sy = c.height / (r[3] - r[1]);
    let any = false;
    x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    for (const key of Object.keys(d)) {
      const a = d[key];
      if (key === 'BcR2' || !Array.isArray(a) || a.length < 12 || a.length % 6) continue;
      const P = [];
      for (let i = 0; i + 1 < a.length; i += 2) P.push([(num(a[i]) - r[0]) * sx, (num(a[i + 1]) - r[1]) * sy]);
      x.beginPath(); x.moveTo(P[0][0], P[0][1]);
      for (let i = 0; i < P.length; i += 3) { const c1 = P[i + 1], c2 = P[i + 2], e = P[(i + 3) % P.length]; x.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]); }
      x.closePath(); x.fill(); any = true;
    }
    x.restore();
    return any;
  }
  /* turn every colour round the colour wheel by deg degrees (the matrix of CSS hue-rotate, which is also what PixelLab uses:
     with it p18's background matches PixelLab's own preview, with the opposite sign or another angle it does not) */
  function hueRotate(c, deg) {
    const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const m0 = 0.213 + co * 0.787 - si * 0.213, m1 = 0.715 - co * 0.715 - si * 0.715, m2 = 0.072 - co * 0.072 + si * 0.928;
    const m3 = 0.213 - co * 0.213 + si * 0.143, m4 = 0.715 + co * 0.285 + si * 0.140, m5 = 0.072 - co * 0.072 - si * 0.283;
    const m6 = 0.213 - co * 0.213 - si * 0.787, m7 = 0.715 - co * 0.715 + si * 0.715, m8 = 0.072 + co * 0.928 + si * 0.072;
    const x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data;      // a clamped array: values are cut to 0..255 by itself
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = m0 * r + m1 * g + m2 * b; d[i + 1] = m3 * r + m4 * g + m5 * b; d[i + 2] = m6 * r + m7 * g + m8 * b;
    }
    x.putImageData(id, 0, 0);
  }
  PLP._ops = { hueRotate: hueRotate, removeColor: removeColor, overlay: overlay, outline: outline, dropShadow: dropShadow, warp: warp, erase: erase, cutCurves: cutCurves };

  /* ---------- fonts ---------- */
  const norm = (s) => String(s || '').toLowerCase().replace(/\.(ttf|otf|woff2?)$/, '').replace(/[-_ ](regular|bold|italic|medium|light|black|heavy|semibold|extrabold|thin)\b/g, '').replace(/[^a-z0-9\u0980-\u09ff]/g, '');
  /* a PixelLab built-in font (not inside the file) -> the closest font we have.
     { family } = we have the very same font; swap: true = only a similar one; icon: true = a picture font we cannot draw */
  const ICONFONT = /icon|social|arrow|dingbat|symbol|awesome|emoji|wingding|webding|ornament/i;
  /* Line measures of fonts built into PixelLab, in font sizes (asc + desc = the height of a line; first = how far the first
     baseline is below the top of the text box). Measured with tools/plp_calib.py: PixelLab's copies are older than the
     fonts on Google Fonts today (its Neuton has lines 1.11 high, today's 1.265), so the numbers of our copies do not fit.
     The last two are fonts we do not have; the numbers still put the stand-in font at the right height. */
  const BUILTIN = {
    neuton: { asc: 0.918, desc: 0.192, top: 0.918, bot: 0.2041 },
    amaranth: { asc: 0.976, desc: 0.236, top: 0.928, bot: 0.223, first: 0.88 },
    abrilfatface: { asc: 1.058, desc: 0.291, top: 1.058, bot: 0.291 },
    memefont: { asc: 1.009, desc: 0.211, top: 1.22, bot: 0.25 },
    bloggersans: { asc: 0.93, desc: 0.22, top: 1.05, bot: 0.25 }
  };
  function assetFont(path, missing, icons) {
    const base = String(path).split('/').pop(), folder = String(path).split('/').slice(-2, -1)[0] || '', key = norm(base), shown = base.replace(/\.(ttf|otf)$/i, '');
    if (ICONFONT.test(base) || ICONFONT.test(folder)) { icons.add(shown); return { family: 'sans-serif', icon: true, swap: true }; }
    const met = BUILTIN[key] || null;
    // the very file name first ("NEXT ART_Bold" when both the regular and the bold file were added)
    const whole = (t) => String(t || '').toLowerCase().replace(/\.(ttf|otf|woff2?)$/, '').replace(/[^a-z0-9\u0980-\u09ff]/g, '');
    for (const f of Fonts.list) if (f.group === 'my' && whole(f.family) === whole(base)) return { family: f.family, bold: false, met: null };
    // a font the user added under the same name counts too (that is how a missing PixelLab font can be supplied); its own measures are used then
    for (const f of Fonts.list) if (f.group !== 'sys' && norm(f.family) === key) return { family: f.family, bold: /bold|black|heavy/i.test(base) && !/bold|black|heavy/i.test(f.family), met: f.group === 'my' ? null : met };
    for (const f of Fonts.list) if (f.group !== 'sys' && key.length > 4 && norm(f.family).length > 4 && key.indexOf(norm(f.family)) === 0) return { family: f.family, bold: /bold|black|heavy/i.test(base), met: f.group === 'my' ? null : met };
    missing.add(shown);
    if (met) { const r = assetSwap(base, folder); r.met = met; return r; }
    return assetSwap(base, folder);
  }
  function assetSwap(base, folder) {
    const fl = folder.toLowerCase(), heavy = /heavy|black|bold|impact|meme/i.test(base);
    let fam = 'Poppins', bold = /bold|heavy|black/i.test(base);
    if (/meme|impact|condensed|narrow|poster/i.test(base)) { fam = 'Anton'; bold = false; }
    else if (/hand|script|callig|brush|sign/.test(fl) || /script|brush|hand/i.test(base)) { fam = 'Dancing Script'; bold = true; }
    else if (/serif|classic|elegant/.test(fl) || /serif|neuton|times|playfair|garamond|georgia|baskerville|bodoni|didot/i.test(base)) fam = 'Playfair Display';
    else if (heavy || (/poster|bold|speacial|special|display|title/.test(fl) && !/regular|light|thin|book|medium/i.test(base))) bold = true;
    if (!Fonts.has(fam)) fam = 'sans-serif';
    return { family: fam, bold: bold, swap: true };
  }

  /* intervals {interval1:{textsIntervalsStart,End,<key>}} -> sorted list [{s,e,v}] */
  function intervals(obj, key) {
    const out = [];
    for (const k of Object.keys(obj || {}).sort((a, b) => num(a.replace(/\D/g, '')) - num(b.replace(/\D/g, '')))) {
      const iv = obj[k];
      if (!iv) continue;
      out.push({ s: num(iv.textsIntervalsStart), e: num(iv.textsIntervalsEnd), v: key ? iv[key] : true });
    }
    return out;
  }

  /* ---------- the importer ---------- */
  PLP.is = (zip) => zip.has('data.plab');
  PLP.thumb = async (zip) => (zip.has('thumb') ? zip.get('thumb') : null);

  /* zip: from Zip.open(). progress(done, total). Returns { width, height, bg, layers, notes[], counts } */
  PLP.read = async function (zip, progress) {
    let data;
    try { data = JSON.parse(await zip.text('data.plab')); } catch (e) { throw new Error('This PLP file could not be read (its project data is damaged)'); }
    const bundle = data.objectsBundle || {};
    const ids = (Array.isArray(data.objectsIds) ? data.objectsIds : Object.keys(bundle)).filter((id) => bundle[id]);
    const notes = new Set(), missingFonts = new Set(), iconFonts = new Set(), counts = { text: 0, picture: 0, skipped: 0 };

    /* --- size --- */
    let cw = 0, ch = 0;
    for (const id of ids) { const o = bundle[id]; if (o.shapeOldContainerWidth > 1 && o.shapeOldContainerHeight > 1) { cw = o.shapeOldContainerWidth; ch = o.shapeOldContainerHeight; break; } }
    const bw = num(data.bgWidth), bh = num(data.bgHeight);
    if (!cw || !ch) { cw = bw > 1 ? bw : 1080; ch = bh > 1 ? bh : 1080; }
    let W, H;
    if (data.bgPhotoForcedDim && bw > 1 && bh > 1) { W = bw; H = bh; }
    else {
      const long = U.clamp(Math.max(bw, bh), 1280, 2 ** 20);  // the file's own size: a project must not lose quality
      if (cw >= ch) { W = long; H = long * ch / cw; } else { H = long; W = long * cw / ch; }
    }
    const cap = Math.min(1, Math.sqrt(MAX_PIX / (W * H)));      // only a huge project is made smaller
    W = Math.max(1, Math.round(W * cap)); H = Math.max(1, Math.round(H * cap));
    const k = W / cw;                                  // container px -> document px

    const layers = [];
    let bg = { type: 'none', color: '#ffffff' };
    let hueDone = false;

    /* --- background --- */
    const bgType = num(data.bgType, 1);
    if (bgType === 1) { const c = argb(data.bgColor); if (c.a > 0.02) bg = { type: 'color', color: c.hex }; }
    else if (bgType === 2) {
      const g = parseGrad(data.bgGradientV2);
      if (g) {
        const c = U.canvas(W, H), x = c.getContext('2d');
        x.fillStyle = Layers.gradient(x, g, 0, 0, W, H); x.fillRect(0, 0, W, H);
        layers.push(Layers.image(c, { name: 'Background', x: W / 2, y: H / 2, locked: true, base: true }));
      }
    } else if (bgType === 4) {
      const entry = findRes(zip, resName(data.bgPhotoSrc));
      if (entry) {
        try {
          const im = await decode(await zip.get(entry)), iw = im.width, ih = im.height, cr = data.bgPhotoCrop || {};
          const l = num(cr.cropInfoPorLeft) / 1e5, t = num(cr.cropInfoPorTop) / 1e5, r = num(cr.cropInfoPorRight, 1e5) / 1e5, b = num(cr.cropInfoPorBottom, 1e5) / 1e5;
          const sx = l * iw, sy = t * ih, sw = Math.max(1, (r - l) * iw), sh = Math.max(1, (b - t) * ih);
          const c = U.canvas(W, H), x = c.getContext('2d');
          x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
          const sc = Math.max(W / sw, H / sh), dw = sw * sc, dh = sh * sc;            // fill the canvas, keep the shape of the photo
          x.drawImage(im, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
          if (im.close) im.close();
          if (num(data.effectHueVal)) { hueRotate(c, num(data.effectHueVal)); hueDone = true; }
          layers.push(Layers.image(c, { name: 'Background', x: W / 2, y: H / 2, locked: true, base: true }));
        } catch (e) { console.error(e); notes.add('The background photo could not be opened'); bg = { type: 'color', color: '#ffffff' }; }
      } else { notes.add('The background photo is missing from the file'); bg = { type: 'color', color: argb(data.bgColor).hex }; }
    }
    /* PixelLab's "effects" change the background only (p18: hue -72 turns the photo behind everything, not the shapes on it) */
    for (const key of ['effectBrightnessVal', 'effectContrastVal', 'effectSaturationVal']) if (num(data[key])) notes.add('Colour settings of the background (brightness, contrast, saturation) are not applied');
    if (num(data.effectHueVal) && !hueDone) notes.add('The colour shift (hue) of the background is not applied');
    for (const key of ['effectVignetteEnabled', 'effectStripesEnabled', 'effectNoiseEnabled']) if (data[key]) notes.add('Background effects (vignette, stripes, noise) are not applied');

    /* --- fonts stored inside the file --- */
    const fontOf = new Map();                 // res name -> family
    const keptFonts = [];                     // the fonts of this file, now also in the font list for later texts
    for (const id of ids) {
      const o = bundle[id];
      if (id.indexOf('text') !== 0) continue;
      for (const iv of intervals(o.textTextFont, 'textsIntervalsFont')) {
        const p = String(iv.v || '');
        if (p.indexOf('/res/') < 0) continue;
        const rn = p.slice(p.lastIndexOf('/') + 1);
        if (fontOf.has(rn)) continue;
        const entry = findRes(zip, rn);
        if (!entry) { fontOf.set(rn, null); continue; }
        try {
          const fam0 = await Fonts.addData(await zip.get(entry), 'PLP font ' + rn, true);   // listed under the name written in the font itself
          Fonts.keep(fam0);                                                              // stays in Text → Font after this project
          fontOf.set(rn, fam0);
          keptFonts.push(fam0);
        }
        catch (e) { console.error(e); fontOf.set(rn, null); notes.add('One of the fonts inside the file could not be loaded'); }
      }
    }

    /* --- objects --- */
    let done = 0;
    for (const id of ids) {
      const o = bundle[id];
      try {
        const l = id.indexOf('text') === 0 ? textLayer(o) : await shapeLayer(o);
        if (l) { layers.push(l); if (l.type === 'text') counts.text++; else counts.picture++; } else counts.skipped++;
      } catch (e) { console.error(id, e); counts.skipped++; notes.add('Some objects could not be opened'); }
      done++;
      if (progress) progress(done, ids.length);
    }
    if (iconFonts.size) notes.add('Small pictures made with PixelLab\'s own icon fonts (' + Array.from(iconFonts).slice(0, 4).join(', ') + ') cannot be shown; those layers are hidden');
    if (missingFonts.size) notes.add('These PixelLab fonts are not in the file and were swapped for similar ones: ' + Array.from(missingFonts).slice(0, 8).join(', ') + (missingFonts.size > 8 ? ' …' : '') +
      '. If you have the font file, add it first (Text → Font → “+ Font”) and open the project again.');
    return { width: W, height: H, bg: bg, layers: layers, notes: Array.from(notes), counts: counts, fonts: Array.from(new Set(keptFonts)) };

    /* ---------- one picture / shape ---------- */
    async function shapeLayer(o) {
      const entry = findRes(zip, resName(o.shapeImageSrc));
      if (!entry) { notes.add('Some pictures are missing from the file'); return null; }
      const w = num(o.shapeWidth), h = num(o.shapeHeight);
      if (!(w > 0.01) || !(h > 0.01)) return null;
      const im = await decode(await zip.get(entry)), iw = im.width, ih = im.height;
      const ci = o.shapeImageCropInfo || {};
      const cl = num(ci.cropInfoPorLeft) / 1e5, ct = num(ci.cropInfoPorTop) / 1e5, cr = num(ci.cropInfoPorRight, 1e5) / 1e5, cb = num(ci.cropInfoPorBottom, 1e5) / 1e5;
      const sx = U.clamp(cl * iw, 0, iw - 1), sy = U.clamp(ct * ih, 0, ih - 1), sw = U.clamp((cr - cl) * iw, 1, iw - sx), sh = U.clamp((cb - ct) * ih, 1, ih - sy);
      if (num(ci.cropInfRot) || ci.mHbGHc || ci.n7gV4v) notes.add('A turned or mirrored crop was opened without the turn');
      /* how many pixels to keep: about what is shown (a little more for small things), never more than the file has */
      const dw = w * k, dh = h * k;
      const f = U.clamp(1600 / Math.max(dw, dh), 1, 2);
      const res = Math.min(1, Math.max(dw * f / sw, dh * f / sh), 2048 / Math.max(sw, sh));
      let c = U.canvas(sw * res, sh * res), x = c.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
      if (im.close) im.close();
      const px = c.width / dw;                         // bitmap px per document px
      if (ci.cropInfCirc) {
        x.globalCompositeOperation = 'destination-in';
        x.beginPath(); x.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2); x.fill();
        x.globalCompositeOperation = 'source-over';
      }
      if (o.shapeBmpErMa && typeof o.shapeBmpErMa === 'object') { try { if (erase(c, o.shapeBmpErMa)) notes.add('Soft eraser edges are shown as hard edges'); } catch (e) { console.error(e); notes.add('Parts rubbed out with the eraser may be visible again'); } }
      if (o.sBmE43 && o.sBmD21 && typeof o.sBmD21 === 'object') { try { cutCurves(c, o.sBmD21); } catch (e) { console.error(e); } }
      if (o.shapeRemoveColorEnabled && Array.isArray(o.shapeRemoveColorCT)) c = removeColor(c, argb(o.shapeRemoveColorCT[0]).hex, num(o.shapeRemoveColorCT[1], 100));
      if (o.shapeColorOverlayEnabled) {
        const g = num(o.sCOfT, 1) === 2 ? parseGrad(o.sCOG) : null;
        c = overlay(c, g || argb(o.shapeColorOverlayColor).css);
      }
      const bw0 = c.width, bh0 = c.height;             // the part that maps onto the box w × h
      let offX = 0, offY = 0;                          // where the centre of the box is, measured from the centre of the final bitmap
      if (o.shapeStrokeEnabled && num(o.shapeStrokeWidth) > 0) {
        const r = outline(c, Math.max(0.5, num(o.shapeStrokeWidth) * k * px * STROKE_K), argb(o.shapeStrokeColor).css);
        c = r.canvas;
      }
      if (o.shapePerspectiveEnabled) {
        const P = (i, a) => num(o['shapePerspectiveP' + i + a]) / 1000;
        const q = [1, 2, 3, 4].map((i) => [P(i, 'X') * bw0, P(i, 'Y') * bh0]);
        // the outline margin (if any) is stretched along with the picture
        const sxm = c.width / bw0, sym = c.height / bh0, qc = q.map((p) => [(p[0] - bw0 / 2) * sxm + c.width / 2, (p[1] - bh0 / 2) * sym + c.height / 2]);
        const r = warp(c, qc);
        if (r) { offX = c.width / 2 - (r.ox + r.canvas.width / 2); offY = c.height / 2 - (r.oy + r.canvas.height / 2); c = r.canvas; }
      }
      if (o.shapeShadowEnabled) {
        const sc = argb(o.shapeShadowColor), rad = num(o.shapeShadowRadius, 10) * k * px;
        const r = dropShadow(c, sc.css, rad * 1.15 + 1, num(o.shapeShadowDx) * k * px, num(o.shapeShadowDy) * k * px);
        c = r.canvas;
      }
      if (o.shapeThreeDEnabled) notes.add('3D depth on shapes is not shown');
      if (o.shapeEmbossEnabled) notes.add('Emboss on shapes is not shown');
      if (o.shapeInnerEnabled) notes.add('Inner shadow on shapes is not shown');

      const rx = num(o.shapeRotationX), ry = num(o.shapeRotationY);
      const fx = Math.cos(ry * Math.PI / 180), fy = Math.cos(rx * Math.PI / 180);       // 180 = mirrored, small angles = a 3-D tilt
      if ((rx % 180) || (ry % 180)) notes.add('3D tilt of pictures is shown only roughly');
      const sX = dw / bw0 * Math.max(0.05, Math.abs(fx)), sY = dh / bh0 * Math.max(0.05, Math.abs(fy));
      const type = num(o.shapeImageShapeType, 2);
      const l = Layers.image(c, {
        name: type === 2 ? 'Photo' : type === 3 ? 'Picture' : 'Shape',
        scaleX: sX, scaleY: sY, flipH: fx < 0, flipV: fy < 0,
        rotation: num(o.shapeRotation) * Math.PI / 180,
        opacity: U.clamp(num(o.shapeOpacity, 100) / 100, 0, 1),
        visible: !o.objectHidden, locked: !!o.objectLocked
      });
      // centre of the box, then shift for a warped picture (the shift turns with the layer)
      let ddx = -offX * sX * (l.flipH ? -1 : 1), ddy = -offY * sY * (l.flipV ? -1 : 1);
      const cs = Math.cos(l.rotation), sn = Math.sin(l.rotation);
      l.x = (num(o.shapeX) + w / 2) * k + ddx * cs - ddy * sn;
      l.y = (num(o.shapeY) + h / 2) * k + ddx * sn + ddy * cs;
      return l;
    }

    /* ---------- one text ---------- */
    function textLayer(o) {
      const text = String(o.textTextString == null ? '' : o.textTextString);
      if (!text.trim()) return null;
      const n = text.length, size = Math.max(2, num(o.textTextSize, 20) * k);
      /* look of every letter, then squeeze into "base look + parts that differ" */
      const col = new Array(n).fill(null), fnt = new Array(n).fill(null), bld = new Array(n).fill(false), itl = new Array(n).fill(false);
      const put = (arr, list, map) => { for (const iv of list) for (let i = Math.max(0, iv.s); i < Math.min(n, iv.e); i++) arr[i] = map(iv.v); };
      put(col, intervals(o.textTextColor, 'textsIntervalsColor'), (v) => argb(v));
      const fam = new Map();
      put(fnt, intervals(o.textTextFont, 'textsIntervalsFont'), (v) => {
        const p = String(v || '');
        if (!fam.has(p)) fam.set(p, p.indexOf('/res/') >= 0 ? { family: fontOf.get(p.slice(p.lastIndexOf('/') + 1)) || null } : assetFont(p, missingFonts, iconFonts));
        return fam.get(p);
      });
      put(bld, intervals(o.textBold), () => true);
      put(itl, intervals(o.textItalic), () => true);
      const DEF = 'sans-serif';
      const look = (i) => {
        const f = fnt[i], c = col[i];
        return { font: f && f.family ? f.family : DEF, bold: bld[i] || !!(f && f.bold), italic: itl[i], color: c ? (c.a >= 0.999 ? c.hex : c.css) : '#000000' };
      };
      const runs = [];
      for (let i = 0; i < n; i++) {
        const st = look(i), prev = runs[runs.length - 1];
        if (prev && prev.st.font === st.font && prev.st.bold === st.bold && prev.st.italic === st.italic && prev.st.color === st.color) prev.e = i + 1;
        else runs.push({ s: i, e: i + 1, st: st });
      }
      // the look that covers the most visible letters is the base
      const weight = new Map();
      for (const r of runs) { const key = JSON.stringify(r.st); weight.set(key, (weight.get(key) || 0) + text.slice(r.s, r.e).replace(/\s/g, '').length); }
      let baseKey = null, best = -1;
      for (const [key, wv] of weight) if (wv > best) { best = wv; baseKey = key; }
      const base = JSON.parse(baseKey);
      const spans = [];
      for (const r of runs) {
        const d = { s: r.s, e: r.e }; let diff = false;
        for (const key of ['color', 'font', 'bold', 'italic']) if (r.st[key] !== base[key]) { d[key] = r.st[key]; diff = true; }
        if (diff) spans.push(d);
      }
      const g = num(o.textAlignment) & 7;
      const l = Layers.text(text, {
        name: text.replace(/\s+/g, ' ').trim().slice(0, 22) || 'Text',
        font: base.font, bold: base.bold, italic: base.italic, color: base.color.charAt(0) === '#' ? base.color : U.rgbToHex.apply(null, (base.color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number)),
        size: size, align: g === 1 ? 'center' : g === 5 ? 'right' : 'left',
        letterSpacing: num(o.textLetterSpacing) * LETTER_K,
        spans: spans.length ? spans : null,
        rotation: num(o.textRotation) * Math.PI / 180,
        opacity: U.clamp(num(o.textOpacity, 100) / 100, 0, 1),
        visible: !o.objectHidden, locked: !!o.objectLocked
      });
      if (base.color.charAt(0) !== '#') l.spans = [{ s: 0, e: n, color: base.color }].concat(l.spans || []);      // a see-through base colour
      /* PixelLab's text box: TEXT_PAD px of air on both sides, plus room for letters that lean out of their own space
         (ZpG28v on the left, deNYb4 on the right). textMaxWidth is the widest the whole box may get. */
      const lsPx = num(o.textLetterSpacing) * LETTER_K * size / 100;      // Android: half of the letter spacing before, half after every letter
      const padL = (TEXT_PAD + Math.max(0, num(o.ZpG28v))) * k, padR = (TEXT_PAD + Math.max(0, num(o.deNYb4))) * k;
      const roomW = num(o.textMaxWidth, -1) > 0 ? Math.max(size * 0.5, num(o.textMaxWidth) * k - padL - padR) : 0;      // room for the lines
      /* A line that is a hair too long still fits: letters measure a little differently from phone to phone. Of the two close
         calls in the samples, p03 "Accelerate your online" is 0.3 % too long for the box and stays on one line in PixelLab,
         p17's ninth dot would make its line 1 % too long and is moved to the next line. */
      if (roomW) l.wrap = Math.max(1, (roomW - lsPx) * WRAP_SLACK);
      if (num(o.textTextFillType, 1) === 2) { const gr = parseGrad(o.textTextGradientV2); if (gr) l.grad = gr; }
      if (o.textStrokeEnabled) { const c = argb(o.textStrokeColor); l.stroke = { on: true, color: c.hex, width: U.clamp(num(o.textStrokeWidth, 4) * k * STROKE_K / size * 100, 0.5, 60) }; }
      if (o.textOuterEnabled) {
        const c = argb(o.textOuterColor), r = num(o.textOuterRadius, 10) * k;
        l.shadow = { on: true, color: c.hex, opacity: c.a, blur: (r * 1.15 + 1) / size * 100, dx: num(o.textOuterDx) * k / size * 100, dy: num(o.textOuterDy) * k / size * 100 };
      }
      if (num(o.textTextCurve)) { l.bend = U.clamp(num(o.textTextCurve) * 0.33, -100, 100); notes.add('Curved text is shown only roughly'); }

      /* --- where PixelLab (Android) puts the lines ---
         Its line is as tall as the font says (asc + desc) plus textLineSpacing px, the extra goes below the line.
         The first baseline sits "top" below shapeY, where top = the tallest letter of the font (never less than asc). */
      let natA = 0, B0 = 0, botA = 0, icons = 0, vis = 0;
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        if (/\s/.test(text.charAt(i))) continue;
        vis++;
        const f = fnt[i];
        if (f && f.icon) icons++;
        const st = look(i), key = st.font + '|' + st.bold + '|' + st.italic;
        if (seen.has(key)) continue;
        seen.add(key);
        let asc, desc, top, bot;
        const m = (f && f.met) || (f && f.swap ? TYPICAL : Fonts.meta[st.font]);
        if (m) { asc = m.asc * size; desc = m.desc * size; top = (m.first || Math.max(m.top, m.asc)) * size; bot = Math.max(m.bot, m.desc) * size; }
        else { const cb = TextRender.fontBox(st, size), sys = st.font === DEF; asc = cb.asc; desc = cb.desc; top = asc + (sys ? 0.14 : 0.06) * size; bot = desc + 0.03 * size; }
        natA = Math.max(natA, asc + desc); B0 = Math.max(B0, top); botA = Math.max(botA, bot);
      }
      if (!natA) { natA = size * 1.17; B0 = size * 0.95; botA = size * 0.25; }
      if (icons && icons === vis) l.visible = false;                 // letters standing in for icons we do not have
      l.lineHeight = U.clamp((natA + num(o.textLineSpacing) * k) / size, 0.2, 5);
      const P = l.lineHeight * size;
      let L = TextRender.layout(l);
      const first = L.lines[0];
      const base0 = l.bend ? first.asc : (P - (first.asc + first.desc)) / 2 + first.asc;      // our first baseline, below the top of our text area
      const lineW = L.tw + lsPx;                                     // the longest line as PixelLab measures it
      const areaW = L.wrapped ? Math.max(lineW, roomW) : lineW;      // once a line is broken, PixelLab's box takes the full width
      const slack = areaW - lineW;
      const off = l.align === 'left' ? 0 : l.align === 'right' ? slack : slack / 2;      // our (tight) box inside that area
      const left = num(o.shapeX) * k + padL + off + lsPx / 2, top0 = num(o.shapeY) * k + B0 + 0.5 * k - base0;      // top-left of our text area
      let pl = 0, pt = 0;
      if (o.textBgEnabled && !l.bend) {
        const c = argb(o.textBgColor), pc = (v) => v / size * 100;
        pl = num(o.textBgPaddingLeft) * k + lsPx / 2 + off; pt = num(o.textBgPaddingTop) * k + (B0 + 0.5 * k - base0);
        const pr = num(o.textBgPaddingRight) * k + lsPx / 2 + (slack - off), pb = num(o.textBgPaddingBottom) * k + botA + base0 - P;
        l.bg = { on: true, color: c.hex, opacity: c.a, pad: 0, radius: 0, pl: pc(pl), pr: pc(pr), pt: pc(pt), pb: pc(pb) };
        if (num(o.textBgFillType, 1) === 2) {
          const gr = parseGrad(o.textBgGradientV2), m = gr && gr.stops.length ? /^#([0-9a-f]{6})/i.exec(gr.stops[Math.floor(gr.stops.length / 2)][1]) : null;
          if (m) l.bg.color = '#' + m[1];
          notes.add('A gradient behind text is shown as one colour');
        }
        L = TextRender.layout(l);
        l.bg.radius = U.clamp(num(o.textBgBorderRadius) * k / (Math.min(L.w, L.h) / 2) * 100, 0, 100);
        L = TextRender.layout(l);
      }
      // centre of the layer; the box turns around the centre of PixelLab's own box, which is close to ours
      l.x = left - pl + L.w / 2;
      l.y = top0 - pt + L.h / 2;
      if (o.textThreeDEnabled) notes.add('3D text is shown flat');
      if (o.textEmbossEnabled) notes.add('Emboss on text is not shown');
      if (o.textInnerEnabled) notes.add('Inner shadow on text is not shown');
      if (o.textReflectionEnabled) notes.add('Text reflection is not shown');
      if (o.textPerEn) notes.add('Perspective on text is not shown');
      if (o.textOuterGlowEnabled) notes.add('Glow around text is not shown');
      if (o.textThreeDShadowEnabled) notes.add('3D shadow on text is not shown');
      return l;
    }
  };
  /* numbers found by comparing with PixelLab's own pictures */
  const STROKE_K = 0.5;        // PixelLab's stroke width is the full line; half of it shows outside the letter / picture
  const LETTER_K = 1;          // PixelLab letter spacing (hundredths of the font size) -> ours (% of the font size)
  const WRAP_SLACK = 1.005;    // see l.wrap
  const TEXT_PAD = 4;          // air (in PixelLab px) between the edge of its text box and the letters, left and right
  const TYPICAL = { asc: 0.93, desc: 0.22, top: 0.93, bot: 0.25 };      // line measures assumed for a PixelLab font we do not have
})();
