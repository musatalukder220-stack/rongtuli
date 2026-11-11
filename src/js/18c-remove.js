'use strict';
/* ============================================================
 * 18c-remove.js : the Remove tool — take a thing out of the picture
 * and fill its place with what is around it (like PicsArt's Remove).
 *
 * It is not background removal (that is Remove BG / Cutout, 18-bench.js).
 * Here the picture stays a whole picture; only the brushed part goes and
 * the background is rebuilt from its edges:
 *
 *   Fill: the palette-harmonic way (Pérez, Gangnet & Blake 2003): the
 *   brushed part is the field of the equation, its rim the boundary,
 *   and the answer is the smooth spread of the rim into it, tilted to
 *   follow how the colour changes along the rim (so a slanted sky or a
 *   striped shirt comes out right, not as a flat smear).
 *
 *   - "Tap" marks the whole patch under the finger (near colours).
 *   - "Brush" marks by hand; Undo inside the tool; Apply is one undo step.
 * ============================================================ */
const RemoveTool = { mem: { size: 44, grow: 3, keep: 20, texture: true } };
(function () {
  const h = U.h;

  /* ---- the bench: the picture laid upright into the canvas, as in 18-bench.js ---- */
  function bench(w, hh) {
    const k = Math.min(Doc.width / w, Doc.height / hh), ox = (Doc.width - w * k) / 2, oy = (Doc.height - hh * k) / 2;
    return {
      w: w, h: hh, k: k, ox: ox, oy: oy,
      toBmp: (p) => { const d = View.toDoc(p[0], p[1]); return [(d[0] - ox) / k, (d[1] - oy) / k]; },
      toView: (x, y) => View.toView(ox + x * k, oy + y * k),
      draw: (ctx, v, pics) => {
        const a = v.toView(ox, oy), s = v.scale * k, r = [a[0], a[1], w * s, hh * s];
        ctx.save();
        ctx.fillStyle = v.checker(ctx); ctx.fillRect(r[0], r[1], r[2], r[3]);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = s < 1 ? 'high' : 'low';
        for (const q of pics) { if (!q) continue; ctx.globalAlpha = q.alpha == null ? 1 : q.alpha; ctx.drawImage(q.c || q, r[0], r[1], r[2], r[3]); }
        ctx.restore();
        return r;
      }
    };
  }
  function target(t) {
    const l = t && t.type === 'image' ? t : Doc.targetImage();
    if (!l) U.toast('Add a photo first');
    return l;
  }

  /* ---- fill the marked part from its rim ----
     A small pyramid: at the coarsest size the marked part takes the average of the picture around it,
     then at every finer size it is smoothed into shape a few rounds. Sampled pixels keep their own
     colour, so the colours spread in from the rim like water — smooth, and no seam at the edge. */
  function fillFromRim(data, w, hh, M, rounds) {
    const N = w * hh;
    const K = new Uint8Array(N);                     // 1 = a pixel that is known and keeps its colour
    let marked = 0, known = 0;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      if (M[i]) marked++;
      else if (data[j + 3] >= 24) { K[i] = 1; known++; }
    }
    if (!marked || marked >= N || !known) return false;
    for (let ch = 0; ch < 3; ch++) {
      // the pyramid: sizes w/2, w/4 … (at most 6 steps down)
      const lv = [];
      {
        const v0 = new Float32Array(N), m0 = new Uint8Array(N);
        for (let i = 0; i < N; i++) { v0[i] = data[i * 4 + ch]; m0[i] = K[i] ? 0 : 1; }
        lv.push({ w: w, h: hh, m: m0, v: v0 });
      }
      while (lv.length < 7 && lv[lv.length - 1].w > 24 && lv[lv.length - 1].h > 24) {
        const p0 = lv[lv.length - 1], nw = Math.max(8, Math.round(p0.w / 2)), nh = Math.max(8, Math.round(p0.h / 2));
        const m2 = new Uint8Array(nw * nh), v2 = new Float32Array(nw * nh);
        for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
          const xa = Math.floor(x * p0.w / nw), xb = Math.min(p0.w, Math.max(xa + 1, Math.floor((x + 1) * p0.w / nw)));
          const ya = Math.floor(y * p0.h / nh), yb = Math.min(p0.h, Math.max(ya + 1, Math.floor((y + 1) * p0.h / nh)));
          let sum = 0, ns = 0, nm = 0;
          for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) {
            const i = yy * p0.w + xx;
            if (p0.m[i]) nm++; else { sum += p0.v[i]; ns++; }
          }
          const k = y * nw + x;
          // a coarse pixel is only "gone" when most of its little block is gone, so a small thing cannot
          // turn the average dark
          m2[k] = ns ? 0 : 1;
          v2[k] = ns ? sum / ns : 0;
        }
        lv.push({ w: nw, h: nh, m: m2, v: v2 });
      }
      // the coarsest: the average of the picture around it
      const top = lv[lv.length - 1];
      {
        let sum = 0, n = 0;
        for (let i = 0; i < top.w * top.h; i++) if (!top.m[i]) { sum += top.v[i]; n++; }
        const avg = n ? sum / n : 128;
        for (let i = 0; i < top.w * top.h; i++) if (top.m[i]) top.v[i] = avg;
      }
      // back up; at every size the marked part is smoothed into shape, the picture stays as it is
      for (let L = lv.length - 2; L >= 0; L--) {
        const P = lv[L], C = lv[L + 1];
        for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
          const i = y * P.w + x;
          if (!P.m[i]) continue;
          const k = Math.min(C.h - 1, Math.floor(y * C.h / P.h)) * C.w + Math.min(C.w - 1, Math.floor(x * C.w / P.w));
          P.v[i] = C.v[k];
        }
        for (let r = 0; r < (rounds || 12); r++) {
          for (let y = 1; y < P.h - 1; y++) for (let x = 1; x < P.w - 1; x++) {
            const i = y * P.w + x;
            if (!P.m[i]) continue;
            P.v[i] = (P.v[i - 1] + P.v[i + 1] + P.v[i - P.w] + P.v[i + P.w]) * 0.25;
          }
        }
      }
      const F = lv[0].v;
      for (let i = 0; i < N; i++) if (!K[i]) data[i * 4 + ch] = F[i];
    }
    return true;
  }

  /* ---- give the filled part the TEXTURE of what is around it ----
     Each brushed pixel takes the grain (the small changes, not the colour) from the same picture point on the
     other side of the edge — as if the surface went on under the removed thing. The colour stays the smooth fill,
     so there is no seam, and the fill no longer looks like a blurred spot. */
  function textureFromRim(data, w, hh, M) {
    const N = w * hh;
    const nearest = new Int32Array(N).fill(-1), dist = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let qt = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (M[i]) continue;
      if ((x > 0 && M[i - 1]) || (x < w - 1 && M[i + 1]) || (y > 0 && M[i - w]) || (y < hh - 1 && M[i + w])) {
        nearest[i] = i; dist[i] = 0; q[qt++] = i;
      }
    }
    for (let qh = 0; qh < qt; qh++) {
      const i = q[qh], x = i % w, y = (i - x) / w;
      if (x > 0 && M[i - 1] && dist[i - 1] < 0) { dist[i - 1] = dist[i] + 1; nearest[i - 1] = nearest[i]; q[qt++] = i - 1; }
      if (x < w - 1 && M[i + 1] && dist[i + 1] < 0) { dist[i + 1] = dist[i] + 1; nearest[i + 1] = nearest[i]; q[qt++] = i + 1; }
      if (y > 0 && M[i - w] && dist[i - w] < 0) { dist[i - w] = dist[i] + 1; nearest[i - w] = nearest[i]; q[qt++] = i - w; }
      if (y < hh - 1 && M[i + w] && dist[i + w] < 0) { dist[i + w] = dist[i] + 1; nearest[i + w] = nearest[i]; q[qt++] = i + w; }
    }
    const plane = new Float32Array(N);
    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < N; i++) plane[i] = data[i * 4 + ch];
      IP.blurPlane(plane, w, hh, 2.2);                          // the soft version of the same picture
      for (let i = 0; i < N; i++) {
        const n = nearest[i];
        if (!M[i] || n < 0) continue;
        const x = i % w, y = (i - x) / w, nx = n % w, ny = (n - nx) / w;
        let sx = 2 * nx - x, sy = 2 * ny - y;                    // the same spot on the other side of the edge
        if (sx < 0 || sy < 0 || sx >= w || sy >= hh || M[sy * w + sx]) { sx = nx + (nx - x) * 0.5; sy = ny + (ny - y) * 0.5; }
        if (sx < 0 || sy < 0 || sx >= w || sy >= hh || M[sy * w + sx]) { sx = nx; sy = ny; }
        const sp = sy * w + sx, d = dist[i];
        let detail = data[sp * 4 + ch] - plane[sp];              // the grain only (no colour)
        // a sample taken from something quite unlike the fill (a dark letter at the edge, a sharp line) is
        // not grain: left out, so no dark or bright streak is painted in
        if (detail > 46 || detail < -46) detail = 0;
        const fall = d <= 6 ? 1 : Math.max(0.35, 1 - (d - 6) * 0.05);
        const v = data[i * 4 + ch] + detail * fall * 0.8;
        data[i * 4 + ch] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    return true;
  }

  /* ---- fill the marked part with the picture's own pattern ----
     Most things people take out of a photo sit on something that repeats: bricks, tiles, wood, cloth,
     grass, a striped wall, a tiled floor. So the first thing tried is: find how far the pattern repeats
     (its period — the same way the repeat of a fabric is measured), then fill the marked part with the
     very same picture taken one period away. The lines go on through the hole exactly as they did before,
     nothing is blurred and nothing is made up that was not in the photo.
     skip (optional): pixels that must not be used as a copy, only as a hole (e.g. another person in the
     picture) — the fill is made from the background only.
     Returns 1 when it worked, 0 when this picture has no such pattern. */
  function periodFill(data, w, hh, M, skip) {
    const N = w * hh;
    let x0 = w, y0 = hh, x1 = -1, y1 = -1, marked = 0;
    for (let i = 0; i < N; i++) if (M[i]) { marked++; const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || marked >= N * 0.8) return 0;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const pad = Math.max(24, Math.round(Math.max(bw, bh) * 1.8));          // room for a whole period (or two) around it
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hh - 1, y1 + pad);
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
    const col = new Uint8ClampedArray(cw * chh * 3), unk = new Uint8Array(cw * chh);
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const i = (y + y0) * w + (x + x0), k = y * cw + x;
      col[k * 3] = data[i * 4]; col[k * 3 + 1] = data[i * 4 + 1]; col[k * 3 + 2] = data[i * 4 + 2];
      unk[k] = M[i] ? 1 : 0;
    }
    const copyable = (k) => !unk[k] && !(skip && skip[k]);          // (a real pixel that may be copied from)
    /* ---- how far does the pattern repeat? (along x and along y) ---- */
    const step = Math.max(1, Math.round(Math.min(cw, chh) / 160));
    /* how much the picture around the hole differs from itself at a distance of one pixel: the
       yardstick the repeat is measured against (a flat wall has almost no such variation) */
    /* (the grain of a photo is different from pixel to pixel, so the sharpness of its edges is measured
       on a lightly smoothed copy: a wall with lines in it is "sharp", a plain surface is not) */
    const sm = new Float32Array(cw * chh * 3), tmp1 = new Float32Array(cw * chh);
    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < cw * chh; i++) tmp1[i] = col[i * 3 + ch];
      IP.blurPlane(tmp1, cw, chh, 1.6);
      for (let i = 0; i < cw * chh; i++) sm[i * 3 + ch] = tmp1[i];
    }
    let variance = 0, vN = 0;
    for (let y = 0; y < chh; y += 2) for (let x = 0; x < cw - 1; x += 2) {
      const a = y * cw + x, b = a + 1;
      if (unk[a] || unk[b]) continue;
      for (let ch = 0; ch < 3; ch++) { const e = sm[a * 3 + ch] - sm[b * 3 + ch]; variance += e * e; }
      vN++;
    }
    variance = vN ? variance / vN : 0;
    const lagScore = (axis, lag) => {
      let s = 0, n = 0;
      if (axis === 0) {
        for (let y = 0; y < chh; y += step) for (let x = 0; x + lag < cw; x += step) {
          const a = y * cw + x, b = a + lag;
          if (!copyable(a) || !copyable(b)) continue;
          for (let ch = 0; ch < 3; ch++) { const e = sm[a * 3 + ch] - sm[b * 3 + ch]; s += e * e; }
          n++;
        }
      } else {
        for (let y = 0; y + lag < chh; y += step) for (let x = 0; x < cw; x += step) {
          const a = y * cw + x, b = a + lag * cw;
          if (!copyable(a) || !copyable(b)) continue;
          for (let ch = 0; ch < 3; ch++) { const e = sm[a * 3 + ch] - sm[b * 3 + ch]; s += e * e; }
          n++;
        }
      }
      return n > 60 ? s / n : -1;
    };
    /* the places where the pattern is most like itself, best first */
    const lagList = (axis, maxLag) => {
      const arr = [];
      for (let lag = 4; lag <= maxLag; lag++) { const v = lagScore(axis, lag); if (v >= 0) arr.push({ lag: lag, v: v }); }
      /* a real pattern: much more like itself one period away than the picture is like itself a pixel
         away — a smooth area (the inside of a sign, a plain wall) never gets through this */
      /* (variance is compared with the same measure on the smoothed copy) */
      const good = arr.filter((a) => a.v < Math.max(variance * 42, 2) && a.lag >= Math.max(6, Math.min(cw, chh) * 0.04));
      good.sort((a, b) => a.v - b.v);
      const out = [];
      for (const a of good) {
        if (out.some((l) => Math.abs(l - a.lag) <= 2)) continue;      // (80 and 81 are the same period)
        out.push(a.lag);
        if (out.length >= 4) break;
      }
      return out;
    };
    const maxLx = Math.min(Math.round(cw * 0.45), 240), maxLy = Math.min(Math.round(chh * 0.45), 240);
    const lagsX = lagList(0, maxLx), lagsY = lagList(1, maxLy);
    if (!lagsX.length && !lagsY.length) return 0;
    /* every place that could be one (or two) periods away, in any direction */
    const offs = [];
    const add = (dx, dy) => {
      if (!dx && !dy) return;
      if (Math.abs(dx) >= cw || Math.abs(dy) >= chh) return;
      for (const o of offs) if (o[0] === dx && o[1] === dy) return;
      offs.push([dx, dy]);
    };
    for (const L of lagsX) for (const m of [1, -1, 2, -2]) add(m * L, 0);
    for (const L of lagsY) for (const m of [1, -1, 2, -2]) add(0, m * L);
    for (const a of lagsX.slice(0, 2)) for (const b of lagsY.slice(0, 2)) for (const sa of [1, -1]) for (const sb of [1, -1]) add(sa * a, sb * b);
    const srcOf = (x, y, dx, dy) => { const sx = x + dx, sy = y + dy; return (sx < 0 || sy < 0 || sx >= cw || sy >= chh) ? -1 : sy * cw + sx; };
    /* the holes, once */
    const holeList = [];
    for (let y = 1; y < chh - 1; y++) for (let x = 1; x < cw - 1; x++) if (unk[y * cw + x]) holeList.push(y * cw + x);
    if (!holeList.length) return 0;
    let bo = null, bs = Infinity, bCov = 0;
    for (const o of offs) {
      /* the copy must be able to cover the whole hole from real picture */
      let cov = 0, n = 0;
      const stp = holeList.length > 4000 ? 2 : 1;
      for (let u = 0; u < holeList.length; u += stp) {
        const k = holeList[u], sp = srcOf(k % cw, (k - (k % cw)) / cw, o[0], o[1]);
        n++;
        if (sp >= 0 && copyable(sp)) cov++;
      }
      const frac = cov / n;
      if (frac < 0.6) continue;
      /* how well the copy joins the picture along the edge of the hole */
      let s2 = 0, n2 = 0;
      for (const k of holeList) {
        const x = k % cw, y = (k - x) / cw;
        for (const [ddx, ddy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
          const nx = x + ddx, ny = y + ddy;
          if (nx < 1 || ny < 1 || nx >= cw - 1 || ny >= chh - 1) continue;
          const nk = ny * cw + nx;
          if (unk[nk]) continue;
          const sp = srcOf(x, y, o[0], o[1]);
          if (sp < 0 || !copyable(sp)) continue;
          for (let ch = 0; ch < 3; ch++) { const e = col[sp * 3 + ch] - col[nk * 3 + ch]; s2 += e * e; }
          n2++;
        }
      }
      const sc = n2 ? s2 / n2 : 1e14;
      if (n2 > 20 && sc < bs) { bs = sc; bo = o; bCov = frac; }
    }
    if (!bo || bs > 9000) return 0;                    // (edges that do not join up: not this pattern)
    /* ---- fill: the same picture, one period away ---- */
    const out = new Uint8ClampedArray(cw * chh * 3), got = new Uint8Array(cw * chh);
    for (let k = 0; k < cw * chh; k++) if (!unk[k]) { out[k * 3] = col[k * 3]; out[k * 3 + 1] = col[k * 3 + 1]; out[k * 3 + 2] = col[k * 3 + 2]; got[k] = 1; }
    const tries = [[bo[0], bo[1]], [-bo[0], -bo[1]], [2 * bo[0], 2 * bo[1]], [-2 * bo[0], -2 * bo[1]]];
    /* (a pixel whose copy falls outside the box takes the same picture from the other side) */
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      if (!unk[k]) continue;
      for (const o of tries) {
        const sp = srcOf(x, y, o[0], o[1]);
        if (sp < 0 || !copyable(sp)) continue;
        out[k * 3] = col[sp * 3]; out[k * 3 + 1] = col[sp * 3 + 1]; out[k * 3 + 2] = col[sp * 3 + 2]; got[k] = 1;
        break;
      }
    }
    /* a pixel the copy could not reach (the copy falls outside the box): the smooth way */
    let holes = 0;
    for (let k = 0; k < cw * chh; k++) if (!got[k]) holes++;
    if (holes) {
      const tmp = new Uint8ClampedArray(out), miss = new Uint8Array(cw * chh);
      for (let k = 0; k < cw * chh; k++) if (!got[k]) { miss[k] = 1; tmp[k * 3] = col[k * 3]; tmp[k * 3 + 1] = col[k * 3 + 1]; tmp[k * 3 + 2] = col[k * 3 + 2]; }
      fillFromRim(tmp, cw, chh, miss, 12);
      for (let k = 0; k < cw * chh; k++) if (!got[k]) { out[k * 3] = tmp[k * 3]; out[k * 3 + 1] = tmp[k * 3 + 1]; out[k * 3 + 2] = tmp[k * 3 + 2]; }
    }
    /* ---- melt the seam: along the edge of the hole the copy is mixed with the picture beside it ---- */
    for (let pass = 0; pass < 3; pass++) {
      const cp = new Uint8ClampedArray(out);
      for (let y = 1; y < chh - 1; y++) for (let x = 1; x < cw - 1; x++) {
        const k = y * cw + x;
        if (!unk[k]) continue;
        if (!(!unk[k - 1] || !unk[k + 1] || !unk[k - cw] || !unk[k + cw])) continue;    // only where the hole touches the real picture
        for (let ch = 0; ch < 3; ch++) {
          const m4 = (cp[(k - 1) * 3 + ch] + cp[(k + 1) * 3 + ch] + cp[(k - cw) * 3 + ch] + cp[(k + cw) * 3 + ch]) / 4;
          const e = cp[k * 3 + ch] - m4;
          if (e > 20 || e < -20) out[k * 3 + ch] = cp[k * 3 + ch] * 0.35 + m4 * 0.65;
        }
      }
    }
    /* ---- is it believable? the filled part must be about the colour of the picture around the hole ---- */
    const sum = [0, 0, 0], sumR = [0, 0, 0];
    let nf = 0, nr = 0;
    for (let y = 1; y < chh - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const k = y * cw + x;
      if (unk[k]) { for (let ch = 0; ch < 3; ch++) sum[ch] += out[k * 3 + ch]; nf++; continue; }
      if (skip && skip[k]) continue;
      /* a real pixel that touches the hole: what the place should look like */
      if (!unk[k - 1] || !unk[k + 1] || !unk[k - cw] || !unk[k + cw]) continue;
      for (let ch = 0; ch < 3; ch++) sumR[ch] += col[k * 3 + ch];
      nr++;
    }
    if (!nf) return 0;
    if (nr) for (let ch = 0; ch < 3; ch++) if (Math.abs(sum[ch] / nf - sumR[ch] / nr) > 26) return 0;
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      if (!unk[k]) continue;
      const i = (y + y0) * w + (x + x0);
      data[i * 4] = out[k * 3]; data[i * 4 + 1] = out[k * 3 + 1]; data[i * 4 + 2] = out[k * 3 + 2];
    }
    return 1;
  }
  RemoveTool._periodFill = periodFill;


  /* ---- which thing to take out: "the person", or the thing under the finger ----
     The AI add-on (see 18b-aicut.js) finds the people in the picture on this phone. That gives
       * the biggest thing in the picture (PicsArt's "Person"), and
       * a short list of what can be picked (Person, Person 2, …), shown as chips.
     Without the add-on the list has one entry (the whole mark). */
  function personMarks(alpha, w, hh) {
    const N = w * hh, seen = new Uint8Array(N), comps = [], stack = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || alpha[i] < 128) continue;
      let sp = 0, n = 0, x0 = w, y0 = hh, x1 = -1, y1 = -1;
      stack[sp++] = i; seen[i] = 1;
      while (sp) {
        const j = stack[--sp], x = j % w, y = (j - x) / w;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !seen[j - 1] && alpha[j - 1] >= 128) { seen[j - 1] = 1; stack[sp++] = j - 1; }
        if (x < w - 1 && !seen[j + 1] && alpha[j + 1] >= 128) { seen[j + 1] = 1; stack[sp++] = j + 1; }
        if (j >= w && !seen[j - w] && alpha[j - w] >= 128) { seen[j - w] = 1; stack[sp++] = j - w; }
        if (j < N - w && !seen[j + w] && alpha[j + w] >= 128) { seen[j + w] = 1; stack[sp++] = j + w; }
      }
      if (n >= Math.max(120, N * 0.002)) comps.push({ n: n, x0: x0, y0: y0, x1: x1, y1: y1 });
    }
    comps.sort((a, b) => b.n - a.n);
    return comps.slice(0, 4);
  }
  RemoveTool._personMarks = personMarks;

  /* the outline of one thing, as numbers (1 = it is there), from the AI's answer */
  function markOf(comp, alpha, w, hh) {
    const M = new Uint8Array(w * hh);
    if (!comp) return M;
    for (let y = comp.y0; y <= comp.y1; y++) for (let x = comp.x0; x <= comp.x1; x++) {
      const i = y * w + x;
      if (alpha[i] >= 128) M[i] = 1;
    }
    return M;
  }

  RemoveTool.open = function (t) {
    const l = target(t);
    if (!l) return;
    const src = l.bitmap, W = src.width, H = src.height, N = W * H, b = bench(W, H), mem = RemoveTool.mem;
    const data = IP.read(src).data;                                 // the colours of the picture (never changed in place)
    const mask = U.canvas(W, H), mx = mask.getContext('2d');        // what is brushed (its alpha)
    const tint = U.canvas(W, H), tx = tint.getContext('2d');        // the same, painted red for the screen
    const comp = U.canvas(W, H), cx = comp.getContext('2d');        // the picture, see-through where brushed
    let M = new Uint8Array(N);                                      // marked, as numbers
    const undo = [], redo = [];
    let tool = 'brush', dirty = true, live = null, finger = null, result = null, closed = false, hintUntil = 0;
    let area = 0;
    let picks = [], pickOn = -1, alpha = null;          // what can be picked (the AI's people), and the one chosen

    const putMask = () => {
      const im = mx.createImageData(W, H), d = im.data;
      for (let i = 0, j = 3; i < N; i++, j += 4) d[j] = M[i] ? 255 : 0;
      mx.putImageData(im, 0, 0);
      syncTint();
      dirty = true;
    };
    /* the screen copy of the mask, painted red (drawing the white mask itself would leave the colour out) */
    const syncTint = () => {
      tx.globalCompositeOperation = 'copy'; tx.fillStyle = '#ff4d6d'; tx.fillRect(0, 0, W, H);
      tx.globalCompositeOperation = 'destination-in'; tx.drawImage(mask, 0, 0); tx.globalCompositeOperation = 'source-over';
    };
    const readMask = () => {
      const d = mx.getImageData(0, 0, W, H).data, m = new Uint8Array(N);
      for (let i = 0, j = 3; i < N; i++, j += 4) m[i] = d[j] > 127 ? 1 : 0;
      M = m;
    };
    const count = () => { let n = 0; for (let i = 0; i < N; i++) n += M[i]; area = n; return n; };
    const step = () => { undo.push(M); if (undo.length > 16) undo.shift(); redo.length = 0; };
    const compose = () => {
      if (!dirty) return;
      dirty = false;
      cx.globalCompositeOperation = 'copy'; cx.drawImage(src, 0, 0);
      cx.globalCompositeOperation = 'destination-out'; cx.drawImage(mask, 0, 0);      // brushed = see-through (shown as a red tint on screen)
      cx.globalCompositeOperation = 'source-over';
    };
    const refresh = () => { UI.refreshTop(); View.request(); };

    /* the brush: an oval dab along the line the finger moved */
    function dab(x0, y0, x1, y1, r, back) {
      mx.save();
      mx.globalCompositeOperation = back ? 'destination-out' : 'source-over';
      mx.strokeStyle = '#fff'; mx.fillStyle = '#fff'; mx.lineCap = 'round'; mx.lineJoin = 'round';
      mx.lineWidth = r * 2; mx.beginPath(); mx.moveTo(x0, y0); mx.lineTo(x1, y1); mx.stroke();
      mx.beginPath(); mx.arc(x1, y1, r, 0, 6.2832); mx.fill();
      mx.restore();
      syncTint();
      dirty = true;
    }
    /* Tap: the whole patch of near colours around the finger, but only up to a good edge */
    function patchAt(x, y, tol) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i0 = y * W + x, j0 = i0 * 4;
      const r0 = data[j0], g0 = data[j0 + 1], b0 = data[j0 + 2];
      if (data[j0 + 3] < 24) return;
      const t2 = tol * tol * 3, seen = new Uint8Array(N), q = [i0];
      seen[i0] = 1;
      let n = 0;
      while (q.length && n < N) {
        const i = q.pop();
        const j = i * 4;
        if (data[j + 3] < 24) continue;
        const dr = data[j] - r0, dg = data[j + 1] - g0, db = data[j + 2] - b0;
        if (dr * dr + dg * dg + db * db > t2) continue;
        M[i] = 1; n++;
        const xx = i % W;
        if (xx > 0 && !seen[i - 1]) { seen[i - 1] = 1; q.push(i - 1); }
        if (xx < W - 1 && !seen[i + 1]) { seen[i + 1] = 1; q.push(i + 1); }
        if (i >= W && !seen[i - W]) { seen[i - W] = 1; q.push(i - W); }
        if (i < N - W && !seen[i + W]) { seen[i + W] = 1; q.push(i + W); }
      }
      putMask();
    }

    /* Apply: fill the marked part with patches of the real picture and put the layer back */
    async function apply() {
      const n = count();
      if (!n) { U.toast('Brush over the thing you want to remove first', 3000); return; }
      if (n > N * 0.9) { U.toast('Almost the whole picture is marked — brush only the thing you want gone', 3600); return; }
      let out = null;
      await U.busy(() => {
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const img = new ImageData(new Uint8ClampedArray(data), W, H);
        // grow the mark a little, so its border is filled too and no rim of the thing is left behind
        const G = new Uint8Array(N), k = Math.round(mem.grow);
        for (let i = 0; i < N; i++) if (M[i]) G[i] = 1;
        for (let p = 0; p < k; p++) {
          const prev = G.slice();
          for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (!prev[i] && (prev[i - 1] || prev[i + 1] || prev[i - W] || prev[i + W])) G[i] = 1;
          }
        }
        let cnt = 0;
        for (let i = 0; i < N; i++) cnt += G[i];
        let ok = false;
        if (mem.texture) {
          /* when a whole person is picked, everything else in the picture is left exactly as it is,
             and nothing is copied from the other people in it */
          const keep = (pickOn >= 0 && picks[pickOn]) ? picks[pickOn].comp : null;
          if (keep) {
            /* only the picked thing goes: the little rim grown around it is kept, everything else is
               left exactly as it was (so a brush mark made earlier does not remove more than asked) */
            const m2 = Math.round(mem.grow) + 2, kx0 = Math.max(0, keep.x0 - m2), ky0 = Math.max(0, keep.y0 - m2);
            const kx1 = Math.min(W - 1, keep.x1 + m2), ky1 = Math.min(H - 1, keep.y1 + m2);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (x < kx0 || x > kx1 || y < ky0 || y > ky1) G[y * W + x] = 0;
            }
          }
          let skip = null;
          if (picks.length) {
            skip = new Uint8Array(N);
            for (let k = 0; k < picks.length; k++) {
              if (k === pickOn) continue;
              const c2 = picks[k].comp;
              for (let y = c2.y0; y <= c2.y1; y++) for (let x = c2.x0; x <= c2.x1; x++) {
                const i = y * W + x;
                if (alpha[i] >= 128) skip[i] = 1;
              }
            }
          }
          /* 1) the picture's own repeating pattern (bricks, tiles, cloth, grass …), when there is one:
                the very same picture, one period away, so the lines go on through the hole */
          if (periodFill(img.data, W, H, G, skip)) ok = true;
          /* 2) anything else: the smooth fill of the rim, then its grain brought back at full size */
          else if (fillFromRim(img.data, W, H, G)) { textureFromRim(img.data, W, H, G); ok = true; }
        }
        if (!ok) ok = fillFromRim(img.data, W, H, G);           // (when "Smooth fill" is chosen)
        if (ok) out = IP.write(img);
        RemoveTool.lastMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
      }, 'Removing…');
      if (!out) { U.toast('Nothing to fill — brush inside the picture', 3000); return; }
      closed = true;
      l.bitmap = out;
      delete l.shape;
      History.commit();
      View.fit();
      U.toast('Removed in ' + (RemoveTool.lastMs / 1000).toFixed(1) + ' s', 2200);
    }
    const m = {
      title: 'Remove',
      items: [
        { id: 'brush', icon: 'brush', label: 'Brush', onTap: () => pick('brush') },
        { id: 'tap', icon: 'dropper', label: 'Tap', onTap: () => pick('tap') },
        { id: 'erase', icon: 'eraser', label: 'Erase', onTap: () => pick('erase') },
        { sep: true },
        { id: 'undo', icon: 'undo', label: 'Undo', onTap: () => { if (undo.length) { redo.push(M); M = undo.pop(); putMask(); count(); refresh(); } } },
        { id: 'clear', icon: 'reset', label: 'Clear', onTap: () => { if (!count()) return; step(); M = new Uint8Array(N); putMask(); count(); refresh(); } }
      ],
      bar: null,
      panel: null,
      render: (ctx, v) => {
        compose();
        const r = b.draw(ctx, v, [src]);
        // the brushed part shows as a warm tint, so it is easy to see what will go
        const s = v.scale * b.k;
        ctx.save();
        ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.clip();
        const a = v.toView(b.ox, b.oy);
        ctx.translate(a[0], a[1]); ctx.scale(s, s);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(tint, 0, 0);
        ctx.restore();
        ctx.save();
        if (finger) {
          ctx.beginPath(); ctx.arc(finger[0], finger[1], mem.size / 2, 0, 6.2832);
          ctx.fillStyle = tool === 'erase' ? 'rgba(120,220,255,.16)' : 'rgba(255,255,255,.16)'; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = tool === 'erase' ? '#8fe3ff' : '#fff'; ctx.stroke();
        }
        ctx.restore();
      },
      pointerDown: (p) => {
        finger = p;
        const q = b.toBmp(p);
        if (tool === 'tap') { live = { tap: p }; }
        else { step(); live = { x: q[0], y: q[1], last: p, back: tool === 'erase' }; dab(q[0], q[1], q[0], q[1], mem.size / 2, live.back); }
        View.request();
      },
      pointerMove: (p) => {
        finger = p;
        if (live && live.tap) return;
        if (live) {
          if (Math.hypot(p[0] - live.last[0], p[1] - live.last[1]) < 1.5) return;
          const q = b.toBmp(p);
          dab(live.x, live.y, q[0], q[1], mem.size / 2, live.back);
          live.x = q[0]; live.y = q[1]; live.last = p;
        }
        View.request();
      },
      pointerUp: (p) => {
        finger = null;
        if (live && live.tap) {
          const q = b.toBmp(live.tap);
          live = null;
          step();
          patchAt(q[0], q[1], 26);
        } else if (live) { live = null; readMask(); }
        count(); refresh();
      },
      pointerCancel: () => {
        finger = null;
        if (live && !live.tap) { M = undo.pop() || M; putMask(); }
        live = null; refresh();
      },
      cancel: () => { closed = true; View.fit(); },
      apply: apply,
      marked: () => count(),                        // (for the tests)
      _dbg: () => { const img = new ImageData(new Uint8ClampedArray(data), W, H); const G = M.slice();
        const c = 300 * W + 450;
        const before = { markedCentre: G[c], src: Array.from(data.slice(c * 4, c * 4 + 4)) };
        const ok = fillFromRim(img.data, W, H, G, 14);
        let ch = 0;
        for (let i = 0; i < N; i++) if (img.data[i * 4] !== data[i * 4]) ch++;
        return { n: count(), ok: ok, changed: ch, before: before, after: Array.from(img.data.slice(c * 4, c * 4 + 4)) }; }
    };
    function pick(id) { tool = id; UI.markActive(id); UI.setPanel(panelFor(id)); View.request(); }
    const note = (t) => h('p', { class: 'panel-note', text: t });
    const go = (id, text) => { const b = h('button', { class: 'btn pri', type: 'button', id: id, text: text }); U.onTap(b, () => UI.applyCurrent()); return b; };
    function panelFor(id) {
      if (id === 'pick') {
        const chips = h('div', { class: 'chips' });
        picks.forEach((p2, i) => {
          const b = h('button', { class: 'chip' + (i === pickOn ? ' on' : ''), type: 'button', 'data-v': String(i), text: p2.label });
          U.onTap(b, () => choosePick(i));
          chips.appendChild(b);
        });
        return h('div', { class: 'panel-pad' },
          h('p', { class: 'panel-note', text: 'The outline was found by the app. Tap another name to pick another one, or brush over more.' }),
          chips,
          h('div', { class: 'row-c' }, go('rm-apply3', 'Remove')));
      }
      if (id === 'tap') {
        return h('div', { class: 'panel-pad' },
          note('Tap the thing you want to remove — the whole patch of that colour goes.'),
          h('div', { class: 'row-c' }, go('rm-apply', 'Remove it')));
      }
      return h('div', { class: 'panel-pad' },
        UI.slider({ label: 'Size', min: 8, max: 220, value: mem.size, onInput: (v) => { mem.size = v; View.request(); } }),
        UI.chips([['on', 'Match the picture'], ['off', 'Smooth fill']], mem.texture ? 'on' : 'off', (v) => { mem.texture = v === 'on'; }),
        note(id === 'erase' ? 'Rub over a red part to take the mark back.'
          : 'Brush over the thing you want to remove, then press Remove. Two fingers zoom.'),
        h('div', { class: 'row-c' }, go('rm-apply2', 'Remove')));
    }
    /* ---- the pickable things (the people the AI finds), quietly, in the background ---- */
    async function findPicks() {
      if (typeof AICut === 'undefined' || !AICut.check) return;
      try {
        if (!(await AICut.check())) return;
        const r = await AICut.cut({ canvas: src, key: 'rm-' + l.id, mode: 'auto' }, () => { });
        if (closed || !r || !r.alpha) return;
        alpha = r.alpha;
        const comps = personMarks(alpha, W, H);
        picks = comps.map((c, i) => ({ label: comps.length > 1 ? (r.pick === 'person' ? 'Person ' : 'Thing ') + (i + 1) : (r.pick === 'person' ? 'Person' : 'Thing'), comp: c }));
        UI.setToolbar([{ id: 'person', icon: 'selection', label: 'Person', onTap: () => choosePick(0) },
          { id: 'brush', icon: 'brush', label: 'Brush', onTap: () => pick('brush') },
          { id: 'tap', icon: 'dropper', label: 'Tap', onTap: () => pick('tap') },
          { id: 'erase', icon: 'eraser', label: 'Erase', onTap: () => pick('erase') },
          { sep: true },
          { id: 'undo', icon: 'undo', label: 'Undo', onTap: () => { if (undo.length) { redo.push(M); M = undo.pop(); putMask(); count(); refresh(); } } },
          { id: 'clear', icon: 'reset', label: 'Clear', onTap: () => { if (!count()) return; step(); M = new Uint8Array(N); putMask(); count(); refresh(); } }]);
        pick('brush');
      } catch (e) { /* no add-on, or it could not run here: the brush alone is fine */ }
    }
    /* pick one of the things the AI found: its whole shape is marked, and the rest of it is protected */
    function choosePick(i) {
      if (!alpha || !picks[i]) return;
      step();
      pickOn = i;
      const comp = picks[i].comp;
      M = markOf(comp, alpha, W, H);
      putMask(); count(); UI.markActive('person');
      UI.setPanel(panelFor('pick'));
      U.toast(picks[i].label + ' picked — press Remove, or brush over more', 2600);
    }

    putMask();
    View.fit();
    UI.enterMode(m);
    pick('brush');
    setTimeout(findPicks, 60);
  };
})();
