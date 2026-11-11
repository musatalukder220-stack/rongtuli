'use strict';
/* 03-fonts.js : fonts that ship inside the app (open-licensed, from Google Fonts) + fonts the user adds */
const Fonts = { list: [], custom: {} };
(function () {
  const EN = ['Poppins', 'Bebas Neue', 'Anton', 'Oswald', 'Playfair Display', 'Abril Fatface', 'Cinzel', 'Pacifico', 'Lobster',
    'Dancing Script', 'Great Vibes', 'Caveat', 'Permanent Marker', 'Bangers', 'Righteous', 'Neuton', 'Amaranth'];
  const BN = ['Hind Siliguri', 'Baloo Da 2', 'Galada', 'Atma', 'Noto Serif Bengali', 'Tiro Bangla', 'Mina'];
  const GENERIC = { 'sans-serif': 1, 'serif': 1, 'monospace': 1, 'cursive': 1 };

  function b64ToBuf(b64) {
    const bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  Fonts.init = async function () {
    const data = window.FONT_DATA || [];
    const have = new Set(), jobs = [];
    if (typeof FontFace !== 'undefined' && document.fonts) {
      for (const f of data) {
        try {
          const face = new FontFace(f.family, b64ToBuf(f.data), { weight: f.weight, style: f.style, unicodeRange: f.range });
          jobs.push(face.load().then(() => { document.fonts.add(face); have.add(f.family); }).catch(() => { }));
        } catch (e) { /* skip this face */ }
      }
    }
    await Promise.all(jobs);
    window.FONT_DATA = null;
    const list = [];
    for (const fam of EN) if (have.has(fam)) list.push({ family: fam, label: fam, group: 'en' });
    for (const fam of BN) if (have.has(fam)) list.push({ family: fam, label: fam, group: 'bn' });
    list.push({ family: 'sans-serif', label: 'Sans', group: 'sys' }, { family: 'serif', label: 'Serif', group: 'sys' },
      { family: 'monospace', label: 'Mono', group: 'sys' }, { family: 'cursive', label: 'Script', group: 'sys' });
    Fonts.list = list.concat(Fonts.list.filter((f) => f.group === 'my'));
    U.emit('fonts');
  };

  Fonts.has = (family) => Fonts.list.some((f) => f.family === family);
  Fonts.css = function (family) {
    if (GENERIC[family]) return family;
    return '"' + String(family).replace(/"/g, '') + '", sans-serif';
  };
  const BENGALI = /[\u0980-\u09FF]/;
  Fonts.isBengali = (s) => BENGALI.test(s || '');
  Fonts.defaultFor = function (text) {
    if (Fonts.isBengali(text) && Fonts.has('Hind Siliguri')) return 'Hind Siliguri';
    return Fonts.has('Poppins') ? 'Poppins' : 'sans-serif';
  };

  /* the name written inside a .ttf / .otf file ("Montserrat Bold"); null when it cannot be read */
  Fonts.nameOf = function (u8) {
    try {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      let base = 0;
      const tag = dv.getUint32(0);
      if (tag === 0x74746366) base = dv.getUint32(12);                                   // a collection: read its first font
      else if (tag !== 0x00010000 && tag !== 0x4F54544F && tag !== 0x74727565) return null;
      const nt = dv.getUint16(base + 4);
      let off = 0;
      for (let i = 0; i < nt; i++) { const q = base + 12 + i * 16; if (dv.getUint32(q) === 0x6E616D65) { off = dv.getUint32(q + 8); break; } }
      if (!off) return null;
      const count = dv.getUint16(off + 2), so = off + dv.getUint16(off + 4), pick = {};
      for (let i = 0; i < count; i++) {
        const q = off + 6 + i * 12, pid = dv.getUint16(q), lang = dv.getUint16(q + 4), nid = dv.getUint16(q + 6), len = dv.getUint16(q + 8), o = so + dv.getUint16(q + 10);
        if (nid !== 1 && nid !== 2 && nid !== 4) continue;
        let str = '';
        if (pid === 3 || pid === 0) { for (let j = 0; j + 1 < len; j += 2) str += String.fromCharCode(dv.getUint16(o + j)); }
        else if (pid === 1) { for (let j = 0; j < len; j++) str += String.fromCharCode(dv.getUint8(o + j)); }
        else continue;
        const score = (pid === 3 ? 2 : 1) + (pid === 3 && lang === 0x409 ? 1 : 0);
        if (str && (!pick[nid] || score > pick[nid].score)) pick[nid] = { s: str, score: score };
      }
      const full = pick[4] && pick[4].s, fam = pick[1] && pick[1].s, sub = pick[2] && pick[2].s;
      return full || (fam ? fam + (sub && !/^regular$/i.test(sub) ? ' ' + sub : '') : null);
    } catch (e) { return null; }
  };

  /* the line measures written inside a .ttf / .otf file, as parts of the font size:
     asc / desc = the line above / below the baseline, top / bot = the tallest and deepest letter. null if unreadable */
  Fonts.metrics = function (u8) {
    try {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      let base = 0;
      const tag = dv.getUint32(0);
      if (tag === 0x74746366) base = dv.getUint32(12);
      else if (tag !== 0x00010000 && tag !== 0x4F54544F && tag !== 0x74727565) return null;
      const nt = dv.getUint16(base + 4), tb = {};
      for (let i = 0; i < nt; i++) { const q = base + 12 + i * 16; tb[dv.getUint32(q)] = dv.getUint32(q + 8); }
      const head = tb[0x68656164], hhea = tb[0x68686561], os2 = tb[0x4F532F32];
      if (head == null || hhea == null) return null;
      const upm = dv.getUint16(head + 18) || 1000, yMin = dv.getInt16(head + 38), yMax = dv.getInt16(head + 42);
      let asc = dv.getInt16(hhea + 4), desc = -dv.getInt16(hhea + 6);
      if (os2 != null) {
        const typoA = dv.getInt16(os2 + 68), typoD = -dv.getInt16(os2 + 70);
        if (dv.getUint16(os2) !== 0xFFFF && (dv.getUint16(os2 + 62) & 0x80)) { asc = typoA; desc = typoD; }      // "use typo metrics"
        else if (!asc && !desc) { if (typoA || typoD) { asc = typoA; desc = typoD; } else { asc = dv.getUint16(os2 + 74); desc = dv.getUint16(os2 + 76); } }
      }
      if (!(asc + desc > 0)) return null;
      return { asc: asc / upm, desc: desc / upm, top: yMax / upm, bot: -yMin / upm };
    } catch (e) { return null; }
  };
  Fonts.meta = {};                          // family -> Fonts.metrics() of fonts loaded from a file

  const clean = (name) => String(name || '').replace(/[^\w\u0980-\u09FF -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'My Font';
  const byKey = new Map();                  // size + checksum of a font file -> family, so the same file is never loaded twice
  /* add font data (.ttf / .otf / .woff). inner = true: prefer the name written inside the file. Returns the family name. */
  Fonts.addData = async function (data, name, inner) {
    if (typeof FontFace === 'undefined') throw new Error('This browser cannot load font files');
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const key = u8.length + ':' + Zip.crc32(u8);
    if (byKey.has(key)) return byKey.get(key);
    /* a font this app kept last time is used by its own name, not as a second copy ("Metropolis 2") */
    for (const fam in Fonts.custom) {
      const b = Fonts.custom[fam];
      if (b && b.byteLength === u8.length && Zip.crc32(new Uint8Array(b)) === Zip.crc32(u8)) { byKey.set(key, fam); return fam; }
    }
    let fam = clean((inner && Fonts.nameOf(u8)) || name);
    const base = fam; let n = 2;
    while (Fonts.has(fam) || GENERIC[fam]) fam = base + ' ' + (n++);
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const face = new FontFace(fam, buf);
    await face.load();
    document.fonts.add(face);
    Fonts.custom[fam] = buf;
    const met = Fonts.metrics(u8);
    if (met) Fonts.meta[fam] = met;
    Fonts.list.push({ family: fam, label: fam, group: 'my' });
    byKey.set(key, fam);
    U.emit('fonts');
    return fam;
  };
  /* add a .ttf / .otf / .woff file picked by the user (it keeps the name of the file) */
  Fonts.addFile = async (file) => Fonts.addData(await U.readAsArrayBuffer(file), file.name.replace(/\.(ttf|otf|woff2?)$/i, ''), false);

  /* ---------- the fonts the user brought in stay with the app ----------
     A font added from a file, or one that came inside a PixelLab .plp project, is kept in the phone's
     database (IndexedDB), so it is in the Text → Font list again after the app is closed and opened.
     The three built-in families and the generic ones are not stored: they are always there. */
  const KEEP = 'rt-fonts';
  let keepDB = null, keepTried = false;
  const keepOpen = () => new Promise((resolve) => {
    if (keepDB || keepTried) { resolve(keepDB); return; }
    keepTried = true;
    try {
      if (U.sandboxed() || typeof indexedDB === 'undefined' || !indexedDB) { resolve(null); return; }
      const r = indexedDB.open(KEEP, 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('fonts')) d.createObjectStore('fonts', { keyPath: 'family' }); };
      r.onsuccess = () => { keepDB = r.result; resolve(keepDB); };
      r.onerror = () => resolve(null); r.onblocked = () => resolve(null);
      setTimeout(() => resolve(keepDB), 4000);
    } catch (e) { resolve(null); }
  });
  Fonts.keep = function (family) {
    const buf = Fonts.custom[family];
    if (!buf) return;                                       // a built-in font: nothing to keep
    keepOpen().then((db) => {
      if (!db) return;
      try { db.transaction('fonts', 'readwrite').objectStore('fonts').put({ family: family, data: buf, meta: Fonts.meta[family] || null, at: Date.now() }); }
      catch (e) { /* the font still works until the app is closed */ }
    });
  };
  /* bring back the fonts kept last time (called once at start, after the built-in ones are ready) */
  Fonts.restore = async function () {
    const db = await keepOpen();
    if (!db) return 0;
    const rows = await new Promise((resolve) => {
      try { const r = db.transaction('fonts', 'readonly').objectStore('fonts').getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); }
      catch (e) { resolve([]); }
    });
    let n = 0;
    for (const row of rows) {
      if (!row || !row.data || Fonts.has(row.family)) continue;
      try {
        const face = new FontFace(row.family, row.data);
        await face.load();
        document.fonts.add(face);
        Fonts.custom[row.family] = row.data;
        if (row.meta) Fonts.meta[row.family] = row.meta;
        Fonts.list.unshift({ family: row.family, label: row.family, group: 'my' });   // newest first, like when it was added
        n++;
      } catch (e) { /* a damaged copy: skip it */ }
    }
    if (n) U.emit('fonts');
    return n;
  };
  Fonts.forget = async function (family) {
    delete Fonts.custom[family];
    Fonts.list = Fonts.list.filter((f) => f.family !== family || f.group !== 'my');
    const db = await keepOpen();
    if (db) { try { db.transaction('fonts', 'readwrite').objectStore('fonts').delete(family); } catch (e) { /* ignore */ } }
    U.emit('fonts');
  };
})();
