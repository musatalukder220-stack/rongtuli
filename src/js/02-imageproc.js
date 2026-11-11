'use strict';
/* ============================================================
 * 02-imageproc.js : pixel maths (adjust, curves, blur, filters)
 * Everything works on ImageData, in place unless noted.
 * "S" (scale) = longest side / 1000, so a filter looks the same
 * on the small preview and on the full-size picture.
 * ============================================================ */
const IP = {};
const FX = { list: [], cats: [] };
(function () {
  IP.read = (canvas) => canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  IP.write = (img) => { const c = U.canvas(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); return c; };
  IP.copy = (img) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);

  /* ---------------- blur ---------------- */
  function boxRadii(sigma, n) {
    const wIdeal = Math.sqrt((12 * sigma * sigma / n) + 1);
    let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    const out = [];
    for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
    return out;
  }
  /* one box-blur pass (horizontal + vertical) of one channel, in place */
  function boxPass(d, w, h, r, ch, step, buf) {
    if (r < 1) return;
    let x, y, s, a, b;
    for (y = 0; y < h; y++) {
      const row = y * w * step + ch;
      s = 0; buf[0] = 0;
      for (x = 0; x < w; x++) { s += d[row + x * step]; buf[x + 1] = s; }
      for (x = 0; x < w; x++) {
        a = x - r; if (a < 0) a = 0; b = x + r + 1; if (b > w) b = w;
        d[row + x * step] = (buf[b] - buf[a]) / (b - a);
      }
    }
    const stride = w * step;
    for (x = 0; x < w; x++) {
      const col = x * step + ch;
      s = 0; buf[0] = 0;
      for (y = 0; y < h; y++) { s += d[col + y * stride]; buf[y + 1] = s; }
      for (y = 0; y < h; y++) {
        a = y - r; if (a < 0) a = 0; b = y + r + 1; if (b > h) b = h;
        d[col + y * stride] = (buf[b] - buf[a]) / (b - a);
      }
    }
  }
  IP.blurPlane = function (plane, w, h, sigma) {
    if (sigma <= 0.25) return plane;
    const buf = new Float64Array(Math.max(w, h) + 1);
    for (const r of boxRadii(sigma, 3)) boxPass(plane, w, h, r, 0, 1, buf);
    return plane;
  };
  IP.blur = function (img, sigma) {
    if (sigma <= 0.25) return img;
    const d = img.data, w = img.width, h = img.height, n = d.length;
    let hasAlpha = false;
    for (let i = 3; i < n; i += 4) if (d[i] !== 255) { hasAlpha = true; break; }
    const buf = new Float64Array(Math.max(w, h) + 1);
    const radii = boxRadii(sigma, 3);
    if (!hasAlpha) {
      for (const r of radii) for (let c = 0; c < 3; c++) boxPass(d, w, h, r, c, 4, buf);
    } else {
      // work premultiplied so see-through pixels do not smear dark edges
      const f = new Float32Array(n);
      for (let i = 0; i < n; i += 4) { const a = d[i + 3] / 255; f[i] = d[i] * a; f[i + 1] = d[i + 1] * a; f[i + 2] = d[i + 2] * a; f[i + 3] = d[i + 3]; }
      for (const r of radii) for (let c = 0; c < 4; c++) boxPass(f, w, h, r, c, 4, buf);
      for (let i = 0; i < n; i += 4) {
        const a = f[i + 3];
        if (a > 0.5) { const k = 255 / a; d[i] = f[i] * k; d[i + 1] = f[i + 1] * k; d[i + 2] = f[i + 2] * k; }
        d[i + 3] = a;
      }
    }
    return img;
  };
  IP.lumaPlane = function (img) {
    const d = img.data, n = img.width * img.height, out = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return out;
  };
  /* blurred brightness map used by Clarity. Made small (<=320px) because it is very soft anyway. */
  IP.clarityMap = function (canvas) {
    const small = U.fitInside(canvas, 320);
    const img = IP.read(small);
    const plane = IP.lumaPlane(img);
    IP.blurPlane(plane, img.width, img.height, Math.max(img.width, img.height) * 0.03);
    return { plane: plane, w: img.width, h: img.height };
  };

  /* ---------------- adjust ---------------- */
  /* p: brightness, contrast, saturation, hue, shadows, highlights, temp, clarity  (each -100..100)
     lb: clarity map from IP.clarityMap (optional) */
  IP.adjust = function (src, dst, p, lb) {
    const s = src.data, d = dst.data, w = src.width, h = src.height;
    const br = p.brightness || 0, co = p.contrast || 0, sa = p.saturation || 0, hu = p.hue || 0;
    const sh = (p.shadows || 0) / 100 * 70, hl = (p.highlights || 0) / 100 * 70, te = (p.temp || 0) / 100;
    const cl = lb ? (p.clarity || 0) / 100 * 1.4 : 0;

    const C = co * 1.27, cf = (259 * (C + 255)) / (255 * (259 - C));
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = (i - 128) * cf + 128 + br * 0.9;

    const useMat = sa !== 0 || hu !== 0;
    let m0 = 1, m1 = 0, m2 = 0, m3 = 0, m4 = 1, m5 = 0, m6 = 0, m7 = 0, m8 = 1;
    if (useMat) {
      const S = sa < 0 ? 1 + sa / 100 : 1 + sa / 100 * 1.5;
      const a = hu / 100 * Math.PI, cs = Math.cos(a), sn = Math.sin(a);
      const h0 = .213 + cs * .787 - sn * .213, h1 = .715 - cs * .715 - sn * .715, h2 = .072 - cs * .072 + sn * .928;
      const h3 = .213 - cs * .213 + sn * .143, h4 = .715 + cs * .285 + sn * .140, h5 = .072 - cs * .072 - sn * .283;
      const h6 = .213 - cs * .213 - sn * .787, h7 = .715 - cs * .715 + sn * .715, h8 = .072 + cs * .928 + sn * .072;
      const lr = .213 * (1 - S), lg = .715 * (1 - S), lbb = .072 * (1 - S);
      const s0 = lr + S, s1 = lg, s2 = lbb, s3 = lr, s4 = lg + S, s5 = lbb, s6 = lr, s7 = lg, s8 = lbb + S;
      m0 = s0 * h0 + s1 * h3 + s2 * h6; m1 = s0 * h1 + s1 * h4 + s2 * h7; m2 = s0 * h2 + s1 * h5 + s2 * h8;
      m3 = s3 * h0 + s4 * h3 + s5 * h6; m4 = s3 * h1 + s4 * h4 + s5 * h7; m5 = s3 * h2 + s4 * h5 + s5 * h8;
      m6 = s6 * h0 + s7 * h3 + s8 * h6; m7 = s6 * h1 + s7 * h4 + s8 * h7; m8 = s6 * h2 + s7 * h5 + s8 * h8;
    }
    const useTemp = te !== 0, tr = 1 + te * 0.22, tg = 1 + te * 0.02, tb = 1 - te * 0.22;
    const useTone = sh !== 0 || hl !== 0 || cl !== 0;
    const lp = cl ? lb.plane : null, lw = cl ? lb.w : 0, lh = cl ? lb.h : 0;
    const kx = cl ? lw / w : 0, ky = cl ? lh / h : 0;
    let i = 0;
    for (let y = 0; y < h; y++) {
      // bilinear rows of the clarity map
      let y0 = 0, y1 = 0, fy = 0;
      if (cl) { let gy = (y + 0.5) * ky - 0.5; if (gy < 0) gy = 0; y0 = gy | 0; if (y0 > lh - 1) y0 = lh - 1; y1 = y0 < lh - 1 ? y0 + 1 : y0; fy = gy - y0; }
      for (let x = 0; x < w; x++, i += 4) {
        let r = s[i], g = s[i + 1], b = s[i + 2];
        if (useTemp) { r *= tr; g *= tg; b *= tb; }
        if (useTone) {
          const L = 0.299 * r + 0.587 * g + 0.114 * b;
          const l = L > 255 ? 1 : L / 255;
          let dl = 0;
          if (sh) dl += sh * l * (1 - l) * (1 - l) * 6.75;
          if (hl) dl += hl * (1 - l) * l * l * 6.75;
          if (cl) {
            let gx = (x + 0.5) * kx - 0.5; if (gx < 0) gx = 0;
            let x0 = gx | 0; if (x0 > lw - 1) x0 = lw - 1;
            const x1 = x0 < lw - 1 ? x0 + 1 : x0, fx = gx - x0;
            const top = lp[y0 * lw + x0] * (1 - fx) + lp[y0 * lw + x1] * fx;
            const bot = lp[y1 * lw + x0] * (1 - fx) + lp[y1 * lw + x1] * fx;
            dl += (L - (top * (1 - fy) + bot * fy)) * cl;
          }
          r += dl; g += dl; b += dl;
        }
        r = lut[r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0];
        g = lut[g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0];
        b = lut[b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0];
        if (useMat) {
          const R = m0 * r + m1 * g + m2 * b, G = m3 * r + m4 * g + m5 * b, B = m6 * r + m7 * g + m8 * b;
          r = R; g = G; b = B;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = s[i + 3];
      }
    }
    return dst;
  };

  /* ---------------- curves ---------------- */
  /* pts: [[x,y],...] sorted by x, values 0..255. Smooth curve that never overshoots (monotone cubic). */
  IP.curveLUT = function (pts) {
    const lut = new Uint8ClampedArray(256), n = pts.length;
    if (n === 0) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
    if (n === 1) { lut.fill(pts[0][1]); return lut; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const dx = [], ms = [];
    for (let i = 0; i < n - 1; i++) { dx.push(Math.max(1e-6, xs[i + 1] - xs[i])); ms.push((ys[i + 1] - ys[i]) / dx[i]); }
    const c1 = [ms[0]];
    for (let i = 0; i < n - 2; i++) {
      const m = ms[i], mNext = ms[i + 1];
      if (m * mNext <= 0) c1.push(0);
      else { const d0 = dx[i], d1 = dx[i + 1], common = d0 + d1; c1.push(3 * common / ((common + d1) / m + (common + d0) / mNext)); }
    }
    c1.push(ms[n - 2]);
    const c2 = [], c3 = [];
    for (let i = 0; i < n - 1; i++) {
      const c = c1[i], m = ms[i], inv = 1 / dx[i], common = c + c1[i + 1] - m - m;
      c2.push((m - c - common) * inv); c3.push(common * inv * inv);
    }
    for (let v = 0; v < 256; v++) {
      if (v <= xs[0]) { lut[v] = ys[0]; continue; }
      if (v >= xs[n - 1]) { lut[v] = ys[n - 1]; continue; }
      let k = 0; while (k < n - 2 && v > xs[k + 1]) k++;
      const t = v - xs[k];
      lut[v] = ys[k] + c1[k] * t + c2[k] * t * t + c3[k] * t * t * t;
    }
    return lut;
  };
  IP.applyLUT = function (src, dst, lr, lg, lb) {
    const s = src.data, d = dst.data, n = s.length;
    for (let i = 0; i < n; i += 4) { d[i] = lr[s[i]]; d[i + 1] = lg[s[i + 1]]; d[i + 2] = lb[s[i + 2]]; d[i + 3] = s[i + 3]; }
    return dst;
  };
  /* c: {rgb:[...], r:[...], g:[...], b:[...]} point lists -> the three final lookup tables */
  IP.curveTables = function (c) {
    const id = [[0, 0], [255, 255]];
    const M = IP.curveLUT(c.rgb || id), R = IP.curveLUT(c.r || id), G = IP.curveLUT(c.g || id), B = IP.curveLUT(c.b || id);
    const lr = new Uint8ClampedArray(256), lg = new Uint8ClampedArray(256), lb = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) { lr[i] = M[R[i]]; lg[i] = M[G[i]]; lb[i] = M[B[i]]; }
    return [lr, lg, lb];
  };
  IP.histogram = function (img) {
    const d = img.data, out = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) out[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
    return out;
  };

  /* ---------------- simple colour operations ---------------- */
  IP.gray = function (img) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = l; }
    return img;
  };
  IP.invert = function (img) { const d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } return img; };
  IP.posterize = function (img, levels) {
    const d = img.data, lut = new Uint8ClampedArray(256), st = 255 / (levels - 1);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.round(i / st) * st);
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return img;
  };
  IP.threshold = function (img, t) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) >= t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
    return img;
  };
  IP.solarize = function (img) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const v = d[i + c]; d[i + c] = v > 127 ? 2 * (255 - v) : 2 * v; }
    return img;
  };
  IP.sepia = function (img, a) {
    const d = img.data, k = 1 - a;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = r * k + a * (.393 * r + .769 * g + .189 * b);
      d[i + 1] = g * k + a * (.349 * r + .686 * g + .168 * b);
      d[i + 2] = b * k + a * (.272 * r + .534 * g + .131 * b);
    }
    return img;
  };
  /* matte look: blacks are lifted, whites pulled down a little */
  IP.fade = function (img, a) {
    const d = img.data, lo = a * 85, hi = 255 - a * 28, lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = lo + i * (hi - lo) / 255;
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return img;
  };
  /* tint the dark areas with one colour and the bright areas with another */
  IP.split = function (img, shC, hlC, amt) {
    const d = img.data;
    const sm = (shC[0] + shC[1] + shC[2]) / 3, hm = (hlC[0] + hlC[1] + hlC[2]) / 3;
    const s0 = (shC[0] - sm) * amt, s1 = (shC[1] - sm) * amt, s2 = (shC[2] - sm) * amt;
    const h0 = (hlC[0] - hm) * amt, h1 = (hlC[1] - hm) * amt, h2 = (hlC[2] - hm) * amt;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255, k = 1 - l;
      d[i] += k * s0 + l * h0; d[i + 1] += k * s1 + l * h1; d[i + 2] += k * s2 + l * h2;
    }
    return img;
  };
  IP.tint = function (img, col, amt, mode) {
    const d = img.data, k = 1 - amt;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = d[i + c], t = col[c];
        let o;
        if (mode === 'multiply') o = v * t / 255;
        else if (mode === 'screen') o = 255 - (255 - v) * (255 - t) / 255;
        else if (mode === 'overlay') o = v < 128 ? 2 * v * t / 255 : 255 - 2 * (255 - v) * (255 - t) / 255;
        else if (mode === 'softlight') { const a = v / 255, b = t / 255; o = ((1 - 2 * b) * a * a + 2 * b * a) * 255; }
        else o = t;
        d[i + c] = v * k + o * amt;
      }
    }
    return img;
  };
  IP.vignette = function (img, amt, start) {
    const d = img.data, w = img.width, h = img.height, cx = (w - 1) / 2, cy = (h - 1) / 2;
    const s0 = start == null ? 0.3 : start;
    let i = 0;
    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / (cy || 1), dy2 = dy * dy;
      for (let x = 0; x < w; x++, i += 4) {
        const dx = (x - cx) / (cx || 1);
        let t = (Math.sqrt((dx * dx + dy2) / 2) - s0) / (1 - s0);
        if (t <= 0) continue;
        if (t > 1) t = 1;
        const f = 1 - amt * t * t * (3 - 2 * t);
        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
      }
    }
    return img;
  };
  IP.grain = function (img, amt, seed) {
    const d = img.data, rnd = U.rng(seed || 1234), k = amt * 255;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * k; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    return img;
  };
  IP.gradientMap = function (img, stops) {
    const lr = new Uint8ClampedArray(256), lg = new Uint8ClampedArray(256), lb = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[k + 1], f = U.clamp((t - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
      lr[i] = a[1][0] + (b[1][0] - a[1][0]) * f; lg[i] = a[1][1] + (b[1][1] - a[1][1]) * f; lb[i] = a[1][2] + (b[1][2] - a[1][2]) * f;
    }
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] + 0.5) | 0; d[i] = lr[l]; d[i + 1] = lg[l]; d[i + 2] = lb[l]; }
    return img;
  };
  IP.curves = function (img, c) { const t = IP.curveTables(c); return IP.applyLUT(img, img, t[0], t[1], t[2]); };
  IP.clarity = function (img, amount) {
    const lb = IP.clarityMap(IP.write(img));
    return IP.adjust(img, img, { clarity: amount }, lb);
  };
  IP.glow = function (img, sigma, amt) {
    const b = IP.blur(IP.copy(img), sigma).data, d = img.data, k = 1 - amt;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) {
      const v = d[i + c]; d[i + c] = v * k + (255 - (255 - v) * (255 - b[i + c]) / 255) * amt;
    }
    return img;
  };
  IP.sharpen = function (img, amt, sigma) {
    const b = IP.blur(IP.copy(img), sigma).data, d = img.data;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const v = d[i + c]; d[i + c] = v + (v - b[i + c]) * amt; }
    return img;
  };
  IP.sobel = function (lum, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
    return out;
  };
  /* move pixels around: fn(x, y, out) puts the source position in out[0], out[1] */
  IP.remap = function (img, fn) {
    const w = img.width, h = img.height, s = img.data, o = new Uint8ClampedArray(s.length), p = [0, 0];
    let i = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
      p[0] = x; p[1] = y;
      fn(x, y, p);
      let sx = p[0], sy = p[1];
      if (sx < 0) sx = 0; else if (sx > w - 1) sx = w - 1;
      if (sy < 0) sy = 0; else if (sy > h - 1) sy = h - 1;
      const x0 = sx | 0, y0 = sy | 0, x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0, fx = sx - x0, fy = sy - y0;
      const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, e = (y1 * w + x1) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      o[i] = s[a] * w00 + s[b] * w10 + s[c] * w01 + s[e] * w11;
      o[i + 1] = s[a + 1] * w00 + s[b + 1] * w10 + s[c + 1] * w01 + s[e + 1] * w11;
      o[i + 2] = s[a + 2] * w00 + s[b + 2] * w10 + s[c + 2] * w01 + s[e + 2] * w11;
      o[i + 3] = s[a + 3] * w00 + s[b + 3] * w10 + s[c + 3] * w01 + s[e + 3] * w11;
    }
    s.set(o);
    return img;
  };

  /* ============================================================
   * Effects list.  kind 'blend'    : slider fades between original and effect
   *                kind 'strength' : slider changes how strong the effect is
   * run(canvas, t, S) -> new canvas     (t = slider 0..1)
   * ============================================================ */
  const px = (fn) => (canvas, t, S) => { const img = IP.read(canvas); fn(img, t, S); return IP.write(img); };
  const A = (img, p) => IP.adjust(img, img, p);
  function add(cat, id, name, run, kind, def) { FX.list.push({ cat: cat, id: id, name: name, run: run, kind: kind || 'blend', def: def == null ? 100 : def }); }
  FX.cats = [['fx', 'FX'], ['bw', 'B&W'], ['blur', 'Blur'], ['art', 'Artistic'], ['color', 'Colors'], ['distort', 'Distort']];
  FX.get = (id) => FX.list.find((f) => f.id === id);

  /* ---- FX ---- */
  add('fx', 'vivid', 'Vivid', px((m) => { A(m, { contrast: 14, saturation: 38, brightness: 2 }); IP.clarity(m, 25); }));
  add('fx', 'warm', 'Warm', px((m) => A(m, { temp: 40, saturation: 8, brightness: 3, contrast: 4 })));
  add('fx', 'cool', 'Cool', px((m) => A(m, { temp: -40, saturation: 6, contrast: 4 })));
  add('fx', 'vintage', 'Vintage', px((m) => { A(m, { contrast: -8, saturation: -28, temp: 22 }); IP.fade(m, .14); IP.split(m, [30, 60, 90], [255, 215, 160], .22); IP.vignette(m, .4); IP.grain(m, .05); }));
  add('fx', 'sepia', 'Sepia', px((m) => { IP.sepia(m, 1); A(m, { contrast: 6 }); IP.vignette(m, .2); }));
  add('fx', 'fade', 'Fade', px((m) => { A(m, { contrast: -16, saturation: -14 }); IP.fade(m, .2); }));
  add('fx', 'film', 'Film', px((m) => { A(m, { contrast: 14, saturation: -10 }); IP.split(m, [10, 60, 80], [255, 225, 180], .22); IP.fade(m, .08); IP.grain(m, .07); }));
  add('fx', 'cross', 'Cross', px((m) => { IP.curves(m, { r: [[0, 0], [64, 40], [192, 220], [255, 255]], g: [[0, 0], [64, 56], [192, 206], [255, 255]], b: [[0, 40], [255, 215]] }); A(m, { saturation: 12, contrast: 6 }); }));
  add('fx', 'lomo', 'Lomo', px((m) => { A(m, { contrast: 26, saturation: 28 }); IP.vignette(m, .65); }));
  add('fx', 'drama', 'Drama', px((m) => { IP.clarity(m, 60); A(m, { contrast: 22, saturation: -25, brightness: -4 }); IP.vignette(m, .35); }));
  add('fx', 'hdr', 'HDR', px((m) => { const lb = IP.clarityMap(IP.write(m)); IP.adjust(m, m, { clarity: 85, shadows: 45, highlights: -35, saturation: 22 }, lb); }));
  add('fx', 'glow', 'Glow', px((m, t, S) => { IP.glow(m, 10 * S, .55); A(m, { saturation: 10, brightness: 3 }); }));
  add('fx', 'sunset', 'Sunset', px((m) => { IP.split(m, [80, 30, 110], [255, 170, 60], .42); A(m, { contrast: 8, saturation: 16, temp: 10 }); }));
  add('fx', 'tealorange', 'Teal Orange', px((m) => { IP.split(m, [0, 95, 115], [255, 150, 70], .36); A(m, { contrast: 10, saturation: 10 }); }));
  add('fx', 'rose', 'Rose', px((m) => { IP.tint(m, [255, 105, 160], .2, 'softlight'); IP.fade(m, .07); A(m, { brightness: 4, saturation: -4 }); }));
  add('fx', 'mint', 'Mint', px((m) => { IP.split(m, [30, 130, 115], [215, 255, 225], .3); A(m, { saturation: -12 }); IP.fade(m, .06); }));
  add('fx', 'dusk', 'Dusk', px((m) => { IP.split(m, [50, 25, 105], [255, 185, 150], .4); A(m, { contrast: 6, brightness: -5 }); }));
  add('fx', 'golden', 'Golden', px((m) => { IP.tint(m, [255, 185, 50], .28, 'overlay'); A(m, { temp: 16, saturation: 10 }); }));

  /* ---- B&W ---- */
  add('bw', 'bw', 'B&W', px((m) => IP.gray(m)));
  add('bw', 'noir', 'Noir', px((m) => { IP.gray(m); A(m, { contrast: 48, brightness: -6 }); IP.vignette(m, .45); }));
  add('bw', 'bwsoft', 'Soft', px((m) => { IP.gray(m); A(m, { contrast: -12 }); IP.fade(m, .16); }));
  add('bw', 'silver', 'Silver', px((m) => { IP.gray(m); IP.split(m, [40, 55, 85], [230, 238, 255], .5); A(m, { contrast: 10 }); }));
  add('bw', 'bwgrain', 'Grainy', px((m) => { IP.gray(m); A(m, { contrast: 22 }); IP.grain(m, .16); }));

  /* ---- Blur ---- */
  add('blur', 'blur', 'Blur', px((m, t, S) => IP.blur(m, Math.max(.4, t * 24 * S))), 'strength', 40);
  add('blur', 'motion', 'Motion', (c, t, S) => {
    const L = Math.max(1, t * 90 * S), n = U.clamp(Math.round(L / 1.5), 2, 48);
    const out = U.canvas(c.width, c.height), x = out.getContext('2d');
    x.drawImage(c, 0, 0);
    for (let i = 1; i < n; i++) { x.globalAlpha = 1 / (i + 1); x.drawImage(c, (i / (n - 1) - 0.5) * L, 0); }
    return out;
  }, 'strength', 45);
  add('blur', 'zoom', 'Zoom', (c, t) => {
    const n = 24, out = U.canvas(c.width, c.height), x = out.getContext('2d'), w = c.width, h = c.height;
    x.drawImage(c, 0, 0);
    for (let i = 1; i < n; i++) { const k = 1 + t * 0.4 * i / (n - 1); x.globalAlpha = 1 / (i + 1); x.drawImage(c, (w - w * k) / 2, (h - h * k) / 2, w * k, h * k); }
    return out;
  }, 'strength', 45);
  add('blur', 'pixelate', 'Pixelate', (c, t, S) => {
    const b = Math.max(2, Math.round((3 + t * 45) * S)), w = c.width, h = c.height;
    const sw = Math.max(1, Math.round(w / b)), shh = Math.max(1, Math.round(h / b));
    const small = U.resample(c, sw, shh), out = U.canvas(w, h), x = out.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(small, 0, 0, w, h);
    return out;
  }, 'strength', 35);

  /* ---- Artistic ---- */
  function sketchPlane(img, S) {
    const w = img.width, h = img.height, lum = IP.lumaPlane(img), inv = new Float32Array(lum.length);
    for (let i = 0; i < lum.length; i++) inv[i] = 255 - lum[i];
    IP.blurPlane(inv, w, h, Math.max(1.2, 5 * S));
    for (let i = 0; i < lum.length; i++) {
      const den = 255 - inv[i];
      let v = den <= 0 ? 255 : lum[i] * 255 / den;
      if (v > 255) v = 255;
      inv[i] = 255 * Math.pow(v / 255, 1.7);
    }
    return inv;
  }
  add('art', 'sketch', 'Sketch', px((m, t, S) => { const p = sketchPlane(m, S), d = m.data; for (let i = 0, j = 0; i < p.length; i++, j += 4) d[j] = d[j + 1] = d[j + 2] = p[i]; }));
  add('art', 'colorsketch', 'Color Sketch', px((m, t, S) => {
    const p = sketchPlane(m, S), d = m.data;
    A(m, { saturation: 30 });
    for (let i = 0, j = 0; i < p.length; i++, j += 4) { const k = p[i] / 255; d[j] = d[j] * k * .75 + p[i] * .25; d[j + 1] = d[j + 1] * k * .75 + p[i] * .25; d[j + 2] = d[j + 2] * k * .75 + p[i] * .25; }
  }));
  add('art', 'poster', 'Poster', px((m) => { A(m, { saturation: 25, contrast: 8 }); IP.posterize(m, 5); }));
  add('art', 'comic', 'Comic', px((m, t, S) => {
    const w = m.width, h = m.height, lum = IP.lumaPlane(m);
    IP.blurPlane(lum, w, h, Math.max(.8, 1.2 * S));
    const e = IP.sobel(lum, w, h), d = m.data;
    A(m, { saturation: 35, contrast: 15 }); IP.posterize(m, 6);
    for (let i = 0, j = 0; i < e.length; i++, j += 4) {
      const k = 1 - U.clamp((e[i] * S - 45) / 70, 0, 1);
      d[j] *= k; d[j + 1] *= k; d[j + 2] *= k;
    }
  }));
  add('art', 'halftone', 'Halftone', (c, t, S) => {
    const w = c.width, h = c.height, cell = Math.max(3, Math.round(9 * S));
    const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    const sm = IP.read(U.resample(c, cols, rows)).data;
    const out = U.canvas(w, h), x = out.getContext('2d');
    x.fillStyle = '#fbf9f2'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const i = (r * cols + q) * 4, L = (0.299 * sm[i] + 0.587 * sm[i + 1] + 0.114 * sm[i + 2]) / 255;
      const rad = cell * 0.66 * Math.sqrt(1 - L);
      if (rad < 0.35) continue;
      x.fillStyle = 'rgb(' + ((sm[i] * .8) | 0) + ',' + ((sm[i + 1] * .8) | 0) + ',' + ((sm[i + 2] * .8) | 0) + ')';
      x.beginPath(); x.arc(q * cell + (r % 2 ? cell / 2 : 0), r * cell, rad, 0, 6.2832); x.fill();
    }
    return out;
  });
  add('art', 'emboss', 'Emboss', px((m, t, S) => {
    const w = m.width, h = m.height, lum = IP.lumaPlane(m), d = m.data, o = Math.max(1, Math.round(S));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xa = x - o < 0 ? 0 : x - o, ya = y - o < 0 ? 0 : y - o, xb = x + o > w - 1 ? w - 1 : x + o, yb = y + o > h - 1 ? h - 1 : y + o;
      const v = 128 + (lum[ya * w + xa] - lum[yb * w + xb]) * 1.4, j = (y * w + x) * 4;
      d[j] = d[j + 1] = d[j + 2] = v;
    }
  }));
  add('art', 'neon', 'Neon', px((m, t, S) => {
    const w = m.width, h = m.height, lum = IP.lumaPlane(m);
    IP.blurPlane(lum, w, h, Math.max(.7, .9 * S));
    const e = IP.sobel(lum, w, h), d = m.data;
    for (let i = 0, j = 0; i < e.length; i++, j += 4) {
      const k = U.clamp(e[i] * S / 60, 0, 1.6), mx = Math.max(d[j], d[j + 1], d[j + 2], 1), n = 255 / mx * k;
      d[j] *= n; d[j + 1] *= n; d[j + 2] *= n;
    }
  }));
  add('art', 'grain', 'Grain', px((m, t) => IP.grain(m, t * .5)), 'strength', 40);
  add('art', 'vignette', 'Vignette', px((m, t) => IP.vignette(m, t * .95)), 'strength', 60);
  add('art', 'sharpen', 'Sharpen', px((m, t, S) => IP.sharpen(m, t * 2.2, Math.max(.8, 1.3 * S))), 'strength', 50);

  /* ---- Colors ---- */
  const duo = (c1, c2) => px((m) => IP.gradientMap(m, [[0, c1], [1, c2]]));
  add('color', 'negative', 'Negative', px((m) => IP.invert(m)));
  add('color', 'duo1', 'Duotone 1', duo([60, 20, 120], [255, 225, 90]));
  add('color', 'duo2', 'Duotone 2', duo([15, 25, 85], [255, 120, 170]));
  add('color', 'duo3', 'Duotone 3', duo([10, 70, 80], [250, 240, 215]));
  add('color', 'thermal', 'Thermal', px((m) => IP.gradientMap(m, [[0, [0, 0, 40]], [.2, [40, 0, 140]], [.4, [170, 0, 150]], [.6, [240, 60, 40]], [.8, [255, 180, 0]], [1, [255, 255, 220]]])));
  add('color', 'solarize', 'Solarize', px((m) => IP.solarize(m)));
  add('color', 'threshold', 'Stamp', px((m) => IP.threshold(m, 128)));
  add('color', 'pop', 'Pop', px((m) => { A(m, { saturation: 60, contrast: 10 }); IP.posterize(m, 4); }));

  /* ---- Distort ---- */
  add('distort', 'mirror', 'Mirror', px((m) => {
    const w = m.width, h = m.height, d = m.data;
    for (let y = 0; y < h; y++) for (let x = (w >> 1); x < w; x++) { const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4; d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; d[a + 3] = d[b + 3]; }
  }));
  add('distort', 'mirror2', 'Mirror 2', px((m) => {
    const w = m.width, h = m.height, d = m.data;
    for (let y = (h >> 1); y < h; y++) for (let x = 0; x < w; x++) { const a = (y * w + x) * 4, b = ((h - 1 - y) * w + x) * 4; d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; d[a + 3] = d[b + 3]; }
  }));
  const radial = (fn) => px((m, t) => {
    const w = m.width, h = m.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    IP.remap(m, (x, y, p) => { const dx = x - cx, dy = y - cy, r = Math.sqrt(dx * dx + dy * dy); if (r < R && r > 1e-6) fn(dx, dy, r / R, t, p, cx, cy); });
  });
  add('distort', 'swirl', 'Swirl', radial((dx, dy, nr, t, p, cx, cy) => { const a = t * 4 * (1 - nr) * (1 - nr), c = Math.cos(a), s = Math.sin(a); p[0] = cx + dx * c - dy * s; p[1] = cy + dx * s + dy * c; }), 'strength', 50);
  add('distort', 'bulge', 'Bulge', radial((dx, dy, nr, t, p, cx, cy) => { const f = Math.pow(nr, t * 1.2); p[0] = cx + dx * f; p[1] = cy + dy * f; }), 'strength', 50);
  add('distort', 'pinch', 'Pinch', radial((dx, dy, nr, t, p, cx, cy) => { const f = Math.pow(nr, 1 / (1 + t * 1.2) - 1); p[0] = cx + dx * f; p[1] = cy + dy * f; }), 'strength', 50);
  add('distort', 'glitch', 'Glitch', px((m, t, S) => {
    const w = m.width, h = m.height, d = m.data, src = new Uint8ClampedArray(d), sh = Math.round(t * 28 * S) + 1, rnd = U.rng(77);
    const off = new Int32Array(h);
    for (let b = 0; b < 12; b++) { const y0 = (rnd() * h) | 0, hh = ((0.015 + rnd() * 0.07) * h) | 0, o = Math.round((rnd() - 0.5) * t * 170 * S); for (let y = y0; y < Math.min(h, y0 + hh); y++) off[y] = o; }
    const wrap = (v) => ((v % w) + w) % w;
    for (let y = 0; y < h; y++) { const row = y * w * 4, o = off[y]; for (let x = 0; x < w; x++) { const i = row + x * 4; d[i] = src[row + wrap(x + o + sh) * 4]; d[i + 1] = src[row + wrap(x + o) * 4 + 1]; d[i + 2] = src[row + wrap(x + o - sh) * 4 + 2]; } }
  }), 'strength', 45);
  add('distort', 'wave', 'Wave', px((m, t, S) => {
    const amp = t * 30 * S, k = 6.2832 / (120 * S);
    IP.remap(m, (x, y, p) => { p[0] = x + amp * Math.sin(y * k); p[1] = y + amp * Math.sin(x * k); });
  }), 'strength', 40);

  /* ---- more looks ---- */
  add('fx', 'cinematic', 'Cinematic', px((m) => { IP.split(m, [0, 55, 65], [255, 175, 95], .38); A(m, { contrast: 12, saturation: 6 }); IP.clarity(m, 30); }));
  add('fx', 'matte', 'Matte', px((m) => { A(m, { contrast: -10, saturation: -8, brightness: 4 }); IP.fade(m, .18); }));
  add('fx', 'moody', 'Moody', px((m) => { IP.clarity(m, 45); A(m, { contrast: 20, saturation: -15, brightness: -8 }); IP.vignette(m, .35); }));
  add('fx', 'bright', 'Bright', px((m) => A(m, { brightness: 14, saturation: 12, highlights: -18, shadows: 14, contrast: 4 })));
  add('fx', 'pastel', 'Pastel', px((m) => { A(m, { contrast: -8, saturation: -20, brightness: 6 }); IP.fade(m, .22); }));
  add('fx', 'saturated', 'Saturated', px((m) => { A(m, { saturation: 55, contrast: 8 }); IP.clarity(m, 18); }));
  add('fx', 'desat', 'Desaturated', px((m) => A(m, { saturation: -48, contrast: 6 })));
  add('fx', 'amber', 'Amber', px((m) => { A(m, { temp: 55, saturation: 6, contrast: 6 }); IP.split(m, [60, 30, 10], [255, 200, 120], .25); }));
  add('fx', 'ice', 'Ice', px((m) => A(m, { temp: -55, saturation: 10, brightness: 4, contrast: 4 })));
  add('fx', 'forest', 'Forest', px((m) => A(m, { hue: 14, saturation: 18, contrast: 6 })));
  add('fx', 'dawn', 'Dawn', px((m) => { IP.split(m, [70, 40, 90], [255, 190, 140], .35); A(m, { brightness: 5, saturation: 8 }); }));
  add('fx', 'ocean', 'Ocean', px((m) => { IP.split(m, [0, 40, 80], [120, 220, 255], .3); A(m, { saturation: 12, contrast: 6 }); }));
  add('fx', 'dreamy', 'Dreamy', px((m, t, S) => { IP.glow(m, 12 * S, .5); A(m, { brightness: 5, saturation: 8 }); IP.fade(m, .1); }));

  add('bw', 'bwcontrast', 'High Contrast', px((m) => { IP.gray(m); A(m, { contrast: 60 }); IP.clarity(m, 35); }));
  add('bw', 'bwfade', 'Faded', px((m) => { IP.gray(m); A(m, { contrast: -15 }); IP.fade(m, .2); }));
  add('bw', 'bwsepia', 'Sepia B&W', px((m) => { IP.gray(m); IP.sepia(m, .7); A(m, { contrast: 10 }); }));
  add('bw', 'bwdramatic', 'Dramatic', px((m) => { IP.gray(m); IP.clarity(m, 70); A(m, { contrast: 35 }); IP.vignette(m, .5); }));

  add('blur', 'softfocus', 'Soft Focus', px((m, t, S) => { IP.glow(m, 8 * S, .4); IP.blur(m, Math.max(.4, .8 * S)); }), 'strength', 50);
  add('blur', 'smooth', 'Smooth', px((m, t, S) => { IP.blur(m, Math.max(.4, 2 * S)); A(m, { saturation: 5 }); }), 'strength', 45);

  add('art', 'charcoal', 'Charcoal', px((m, t, S) => { IP.gray(m); A(m, { contrast: 30 }); IP.grain(m, .2); IP.blur(m, Math.max(.3, .6 * S)); }));
  add('art', 'watercolor', 'Watercolor', px((m, t, S) => { IP.blur(m, Math.max(.5, 3 * S)); A(m, { saturation: 20, contrast: -5 }); IP.posterize(m, 6); }));
  add('art', 'oil', 'Oil Paint', px((m, t, S) => { IP.blur(m, Math.max(.5, 4 * S)); A(m, { saturation: 25 }); IP.posterize(m, 7); IP.sharpen(m, .8, Math.max(.6, S)); }));
  add('art', 'lightleak', 'Light Leak', px((m) => { IP.tint(m, [255, 120, 40], .3, 'overlay'); IP.fade(m, .12); IP.vignette(m, .3); }));
  add('art', 'ink', 'Ink', px((m) => { IP.gray(m); A(m, { contrast: 35 }); IP.grain(m, .1); }));

  add('color', 'duo4', 'Duotone 4', duo([20, 10, 60], [255, 200, 80]));
  add('color', 'duo5', 'Duotone 5', duo([0, 40, 30], [200, 255, 230]));
  add('color', 'tritone', 'Tritone', px((m) => IP.gradientMap(m, [[0, [10, 10, 40]], [.5, [120, 120, 120]], [1, [255, 240, 200]]])));
  add('color', 'hue', 'Hue Shift', px((m, t) => A(m, { hue: t * 90 - 45 })), 'strength', 50);
  add('color', 'mono', 'Mono', px((m) => { IP.gray(m); IP.tint(m, [200, 220, 255], .15, 'softlight'); }));

  add('distort', 'fisheye', 'Fisheye', radial((dx, dy, nr, t, p, cx, cy) => { const f = Math.pow(nr, 1 + t * 1.5); p[0] = cx + dx * f; p[1] = cy + dy * f; }), 'strength', 50);
  add('distort', 'tunnel', 'Tunnel', radial((dx, dy, nr, t, p, cx, cy) => { const f = nr * (1 + t * (1 - nr)); p[0] = cx + dx * f; p[1] = cy + dy * f; }), 'strength', 50);
  add('distort', 'ripple', 'Ripple', px((m, t, S) => {
    const w = m.width, h = m.height, cx = w / 2, cy = h / 2;
    IP.remap(m, (x, y, p) => { const dx = x - cx, dy = y - cy, r = Math.sqrt(dx * dx + dy * dy) || 1; const s = Math.sin(r * 0.06 * S - t * 6) * t * 14 * S; p[0] = x + dx / r * s; p[1] = y + dy / r * s; });
  }), 'strength', 45);
  add('distort', 'kaleido', 'Kaleidoscope', px((m, t, S) => {
    const w = m.width, h = m.height, cx = w / 2, cy = h / 2, seg = Math.PI / 6;
    IP.remap(m, (x, y, p) => { const dx = x - cx, dy = y - cy; let a = Math.atan2(dy, dx); a = Math.abs(((a % seg) + seg) % seg); if (a > seg / 2) a = seg - a; const r = Math.sqrt(dx * dx + dy * dy); p[0] = cx + Math.cos(a) * r; p[1] = cy + Math.sin(a) * r; });
  }));
  add('distort', 'jitter', 'Jitter', px((m, t, S) => { const rnd = U.rng(9); IP.remap(m, (x, y, p) => { p[0] = x + (rnd() - 0.5) * t * 22 * S; p[1] = y + (rnd() - 0.5) * t * 22 * S; }); }), 'strength', 40);
})();
