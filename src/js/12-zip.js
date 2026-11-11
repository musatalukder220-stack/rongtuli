'use strict';
/* ============================================================
 * 12-zip.js : read and write ZIP files without any library.
 *   - PixelLab .plp files and our own project files are ZIPs.
 *   - Reading uses the browser's built-in unpacker when there is one,
 *     otherwise the small inflate() below.
 *   - Writing stores files without compression (pictures are already compressed).
 * ============================================================ */
const Zip = {};
(function () {
  const dec = (bytes, utf8) => {
    try { return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(bytes); }
    catch (e) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
  };

  /* ---------- inflate (RFC 1951), used when DecompressionStream is missing ---------- */
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function table(lengths, n) {
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
    return { count: count, symbol: symbol };
  }
  let FIXED = null;
  function fixedTables() {
    if (FIXED) return FIXED;
    const l = new Uint8Array(288);
    for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
    const d = new Uint8Array(30).fill(5);
    FIXED = [table(l, 288), table(d, 30)];
    return FIXED;
  }
  Zip.inflate = function (src, sizeHint) {
    let out = new Uint8Array(Math.max(64, sizeHint || src.length * 3)), op = 0, ip = 0, buf = 0, cnt = 0;
    const bad = () => new Error('This file is damaged (bad zip data)');
    const room = (n) => { if (op + n > out.length) { const t = new Uint8Array(Math.max(out.length * 2, op + n)); t.set(out.subarray(0, op)); out = t; } };
    const bits = (n) => {
      while (cnt < n) { if (ip >= src.length) throw bad(); buf |= src[ip++] << cnt; cnt += 8; }
      const v = buf & ((1 << n) - 1); buf >>>= n; cnt -= n; return v;
    };
    const sym = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.symbol[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw bad();
    };
    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        buf = 0; cnt = 0;
        if (ip + 4 > src.length) throw bad();
        const len = src[ip] | (src[ip + 1] << 8); ip += 4;
        if (ip + len > src.length) throw bad();
        room(len); out.set(src.subarray(ip, ip + len), op); op += len; ip += len;
        continue;
      }
      let hl, hd;
      if (type === 1) { const f = fixedTables(); hl = f[0]; hd = f[1]; }
      else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        const lens = new Uint8Array(320);
        for (let i = 0; i < ncode; i++) lens[ORDER[i]] = bits(3);
        const hc = table(lens, 19);
        const all = new Uint8Array(nlen + ndist);
        for (let i = 0; i < nlen + ndist;) {
          const s = sym(hc);
          if (s < 16) all[i++] = s;
          else {
            let prev = 0, rep;
            if (s === 16) { if (!i) throw bad(); prev = all[i - 1]; rep = 3 + bits(2); }
            else if (s === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (i + rep > nlen + ndist) throw bad();
            while (rep--) all[i++] = prev;
          }
        }
        hl = table(all.subarray(0, nlen), nlen); hd = table(all.subarray(nlen), ndist);
      } else throw bad();
      for (;;) {
        let s = sym(hl);
        if (s < 256) { room(1); out[op++] = s; continue; }
        if (s === 256) break;
        s -= 257;
        if (s >= 29) throw bad();
        const len = LBASE[s] + bits(LEXT[s]);
        const ds = sym(hd);
        if (ds >= 30) throw bad();
        const dist = DBASE[ds] + bits(DEXT[ds]);
        if (dist > op) throw bad();
        room(len);
        if (dist >= len) { out.set(out.subarray(op - dist, op - dist + len), op); op += len; }
        else for (let i = 0; i < len; i++) { out[op] = out[op - dist]; op++; }
      }
    } while (!last);
    return out.subarray(0, op);
  };

  Zip.native = typeof DecompressionStream === 'function';     // tests switch this off to exercise inflate()
  async function unpack(bytes, usize) {
    if (Zip.native) {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(buf);
      } catch (e) { /* 'deflate-raw' not supported here, or a stream problem: use our own */ }
    }
    return Zip.inflate(bytes, usize);
  }

  /* ---------- read ---------- */
  /* returns { names, has(name), get(name) -> Promise<Uint8Array>, text(name) -> Promise<string> } */
  Zip.open = function (input) {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = u8.length;
    let eocd = -1;
    for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error(n > 4 && dv.getUint32(0, true) === 0x04034b50 ? 'This file is incomplete: its end is missing. Copy or download it again.' : 'This is not a project file (no zip directory found)');
    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    if (p === 0xffffffff || total === 0xffff) throw new Error('This project file is too big to open here');
    const entries = new Map(), names = [];
    for (let i = 0; i < total; i++) {
      if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw new Error('This file is damaged (bad zip directory)');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec(u8.subarray(p + 46, p + 46 + nl), !!(flags & 0x800));
      if (name[name.length - 1] !== '/') { entries.set(name, { method: method, csize: csize, usize: usize, lho: lho, enc: !!(flags & 1) }); names.push(name); }
      p += 46 + nl + el + cl;
    }
    const api = { names: names };
    api.has = (name) => entries.has(name);
    api.size = (name) => (entries.has(name) ? entries.get(name).usize : 0);
    api.get = async function (name) {
      const e = entries.get(name);
      if (!e) throw new Error('"' + name + '" is missing from the project file');
      if (e.enc) throw new Error('This project file is password protected');
      const q = e.lho;
      if (q + 30 > n || dv.getUint32(q, true) !== 0x04034b50) throw new Error('This file is damaged (bad zip entry)');
      const start = q + 30 + dv.getUint16(q + 26, true) + dv.getUint16(q + 28, true);
      if (start + e.csize > n) throw new Error('This file is cut off (download it again)');
      const raw = u8.subarray(start, start + e.csize);
      if (e.method === 0) return raw;
      if (e.method === 8) return unpack(raw, e.usize);
      throw new Error('This project file uses a zip method that is not supported');
    };
    api.text = async (name) => dec(await api.get(name), true);
    return api;
  };

  /* ---------- write (stored, no compression) ---------- */
  let CRC = null;
  Zip.crc32 = function (u8) {
    if (!CRC) {
      CRC = new Uint32Array(256);
      for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[i] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  /* files: [{ name, data: Uint8Array | ArrayBuffer | Blob | string }]  ->  Promise<Blob> */
  Zip.make = async function (files, mime) {
    const enc = new TextEncoder(), parts = [], dir = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const f of files) {
      let data = f.data;
      if (typeof data === 'string') data = enc.encode(data);
      else if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
      else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
      const name = enc.encode(f.name), crc = f.crc != null ? f.crc : Zip.crc32(data);      // f.crc: a checksum worked out earlier
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      dir.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    let dirSize = 0;
    for (const b of dir) dirSize += b.byteLength;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, dirSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(dir, [end.buffer]), { type: mime || 'application/zip' });
  };

  /* what kind of file is this? (looks at the first bytes) */
  Zip.sniff = function (b) {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
    if (b.length >= 4) {
      const t = String.fromCharCode(b[0], b[1], b[2], b[3]);
      if (t === '\u0000\u0001\u0000\u0000' || t === 'true' || t === 'OTTO' || t === 'ttcf' || t === 'wOFF' || t === 'wOF2') return 'font';
      if (t === 'PK\u0003\u0004') return 'zip';
    }
    return 'other';
  };
})();
