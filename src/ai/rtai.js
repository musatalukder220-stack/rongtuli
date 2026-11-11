/* RongTuli AI add-on: finds the main person or thing in a picture.
   Everything runs on the device itself; no picture is sent anywhere.

   One file, two uses:
     new Worker('ai/rtai.js')              answers messages (see the end of this file)
     <script src="ai/rtai.js"></script>    gives window.RTAI with the same function (used where a worker cannot start)

   It needs, in the same folder:
     ort.wasm.min.js + ort-wasm-simd.wasm   ONNX Runtime Web 1.17.3 (MIT)
     u2netp.onnx                            "object": U2-Net small – any clear thing, animal, person
     modnet.onnx                            "person": MODNet – people, with soft hair edges

   RTAI.cut(q, note) -> { alpha: Uint8Array(W * H), pick: 'person' | 'object', info }
     q.key    one name per picture: results of the models are kept while the key stays the same
     q.mode   'auto' | 'person' | 'object'
     q.W, q.H size of the picture
     q.obj    Uint8ClampedArray, the picture squeezed to 320 x 320 (RGBA)
     q.per    { w, h, d }: the picture at the size MODNet wants (both sides a multiple of 32), RGBA
     q.low    { w, h, d }: brightness of the picture (Uint8Array), longest side about 1024 or less
     q.full   Uint8Array(W * H): brightness at full size
     note(stage, done, total)   'load' with bytes, then 'find', 'edges' */
(function (G) {
  'use strict';
  var inWorker = typeof WorkerGlobalScope !== 'undefined' && G instanceof WorkerGlobalScope;
  var BASE = (function () {
    try {
      var u = inWorker ? String(G.location.href) : String((document.currentScript && document.currentScript.src) || '');
      u = u.split('#')[0].split('?')[0];
      return u.slice(0, u.lastIndexOf('/') + 1);
    } catch (e) { return 'ai/'; }
  })();
  var ENGINE = { js: 'ort.wasm.min.js', wasm: 'ort-wasm-simd.wasm', bytes: 10551547 };
  var MODELS = { object: { file: 'u2netp.onnx', bytes: 4574861 }, person: { file: 'modnet.onnx', bytes: 25888640 } };
  var sessions = {}, enginePromise = null, raw = { key: null };

  function loadScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('could not load ' + url)); };
      document.head.appendChild(s);
    });
  }
  /* read a file while telling how many bytes came in */
  async function fetchBytes(url, onBytes) {
    var r = await fetch(url);
    if (!r.ok) throw new Error('could not load ' + url + ' (' + r.status + ')');
    if (!r.body || !r.body.getReader) { var all = new Uint8Array(await r.arrayBuffer()); onBytes(all.length); return all; }
    var reader = r.body.getReader(), chunks = [], n = 0;
    for (;;) {
      var x = await reader.read();
      if (x.done) break;
      chunks.push(x.value); n += x.value.length; onBytes(x.value.length);
    }
    var out = new Uint8Array(n), o = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }
  function engine(onBytes) {
    if (!enginePromise) {
      enginePromise = (async function () {
        if (typeof WebAssembly !== 'object') throw new Error('this browser has no WebAssembly');
        if (!G.ort) { if (inWorker) importScripts(BASE + ENGINE.js); else await loadScript(BASE + ENGINE.js); }
        // the engine is fetched here (so the bar can move) and handed over as a blob
        var bytes = await fetchBytes(BASE + ENGINE.wasm, onBytes), paths = {};
        paths[ENGINE.wasm] = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
        var w = G.ort.env.wasm;
        w.wasmPaths = paths; w.numThreads = 1; w.simd = true; w.proxy = false;
        G.ort.env.logLevel = 'error';
        return G.ort;
      })();
      enginePromise.catch(function () { enginePromise = null; });      // a later try starts again
    }
    return enginePromise;
  }
  async function session(kind, onBytes) {
    if (!sessions[kind]) {
      var ort = await engine(onBytes);
      var bytes = await fetchBytes(BASE + MODELS[kind].file, onBytes);
      sessions[kind] = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    }
    return sessions[kind];
  }

  /* ---------- the two models ---------- */
  async function runObject(rgba, onBytes) {
    var S = 320, n = S * S, x = new Float32Array(3 * n), mx = 1, i, p, j;
    for (i = 0; i < n * 4; i += 4) { if (rgba[i] > mx) mx = rgba[i]; if (rgba[i + 1] > mx) mx = rgba[i + 1]; if (rgba[i + 2] > mx) mx = rgba[i + 2]; }
    for (p = 0, j = 0; p < n; p++, j += 4) {
      x[p] = (rgba[j] / mx - 0.485) / 0.229; x[n + p] = (rgba[j + 1] / mx - 0.456) / 0.224; x[2 * n + p] = (rgba[j + 2] / mx - 0.406) / 0.225;
    }
    var s = await session('object', onBytes), feeds = {};
    feeds[s.inputNames[0]] = new G.ort.Tensor('float32', x, [1, 3, S, S]);
    var o = (await s.run(feeds, [s.outputNames[0]]))[s.outputNames[0]].data;
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < n; i++) { if (o[i] < lo) lo = o[i]; if (o[i] > hi) hi = o[i]; }
    var m = new Float32Array(n), k = hi - lo > 1e-6 ? 1 / (hi - lo) : 0;
    for (i = 0; i < n; i++) m[i] = (o[i] - lo) * k;
    return { w: S, h: S, d: m };
  }
  async function runPerson(rgba, w, h, onBytes) {
    var n = w * h, x = new Float32Array(3 * n), p, j, i;
    for (p = 0, j = 0; p < n; p++, j += 4) { x[p] = rgba[j] / 127.5 - 1; x[n + p] = rgba[j + 1] / 127.5 - 1; x[2 * n + p] = rgba[j + 2] / 127.5 - 1; }
    var s = await session('person', onBytes), feeds = {};
    feeds[s.inputNames[0]] = new G.ort.Tensor('float32', x, [1, 3, h, w]);
    var o = (await s.run(feeds))[s.outputNames[0]].data, m = new Float32Array(n);
    for (i = 0; i < n; i++) m[i] = o[i] < 0 ? 0 : o[i] > 1 ? 1 : o[i];
    return { w: w, h: h, d: m };
  }

  /* ---------- small picture maths ---------- */
  function resize(src, sw, sh, dw, dh) {
    if (sw === dw && sh === dh) return src;
    var out = new Float32Array(dw * dh), fx = sw / dw, fy = sh / dh, x, y;
    var X0 = new Int32Array(dw), X1 = new Int32Array(dw), TX = new Float32Array(dw);
    for (x = 0; x < dw; x++) {
      var sx = (x + 0.5) * fx - 0.5; if (sx < 0) sx = 0; if (sx > sw - 1) sx = sw - 1;
      X0[x] = Math.floor(sx); X1[x] = Math.min(sw - 1, X0[x] + 1); TX[x] = sx - X0[x];
    }
    for (y = 0; y < dh; y++) {
      var sy = (y + 0.5) * fy - 0.5; if (sy < 0) sy = 0; if (sy > sh - 1) sy = sh - 1;
      var y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), ty = sy - y0, r0 = y0 * sw, r1 = y1 * sw, o = y * dw;
      for (x = 0; x < dw; x++) {
        var a = src[r0 + X0[x]], b = src[r0 + X1[x]], c = src[r1 + X0[x]], d = src[r1 + X1[x]], tx = TX[x];
        out[o + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      }
    }
    return out;
  }
  /* mean of the (2r+1) x (2r+1) square around every pixel (smaller squares at the border) */
  function boxMean(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, i, acc, cnt, hi;
    for (y = 0; y < h; y++) {
      var row = y * w;
      acc = 0; hi = Math.min(r, w - 1);
      for (i = 0; i <= hi; i++) acc += src[row + i];
      cnt = hi + 1;
      for (x = 0; x < w; x++) {
        tmp[row + x] = acc / cnt;
        if (x + r + 1 < w) { acc += src[row + x + r + 1]; cnt++; }
        if (x - r >= 0) { acc -= src[row + x - r]; cnt--; }
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0; hi = Math.min(r, h - 1);
      for (i = 0; i <= hi; i++) acc += tmp[i * w + x];
      cnt = hi + 1;
      for (y = 0; y < h; y++) {
        out[y * w + x] = acc / cnt;
        if (y + r + 1 < h) { acc += tmp[(y + r + 1) * w + x]; cnt++; }
        if (y - r >= 0) { acc -= tmp[(y - r) * w + x]; cnt--; }
      }
    }
    return out;
  }
  /* drop specks: keep only what lies near a piece that is big enough */
  function despeckle(p, w, h) {
    var n = w * h, lab = new Int32Array(n), stack = new Int32Array(n), areas = [0], cur = 0, i, biggest = 0;
    for (i = 0; i < n; i++) {
      if (p[i] <= 0.5 || lab[i]) continue;
      cur++; var top = 0, area = 0; stack[top++] = i; lab[i] = cur;
      while (top) {
        var q = stack[--top], x = q % w; area++;
        if (x > 0 && !lab[q - 1] && p[q - 1] > 0.5) { lab[q - 1] = cur; stack[top++] = q - 1; }
        if (x < w - 1 && !lab[q + 1] && p[q + 1] > 0.5) { lab[q + 1] = cur; stack[top++] = q + 1; }
        if (q >= w && !lab[q - w] && p[q - w] > 0.5) { lab[q - w] = cur; stack[top++] = q - w; }
        if (q < n - w && !lab[q + w] && p[q + w] > 0.5) { lab[q + w] = cur; stack[top++] = q + w; }
      }
      areas.push(area); if (area > biggest) biggest = area;
    }
    if (!biggest) return p;
    var min = Math.max(n * 0.0008, biggest * 0.02), keep = new Float32Array(n), dropped = 0;
    for (i = 0; i < n; i++) { if (lab[i]) { if (areas[lab[i]] >= min) keep[i] = 1; else dropped++; } }
    var near = boxMean(keep, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.03))), out = new Float32Array(n);
    for (i = 0; i < n; i++) out[i] = near[i] > 1e-6 ? p[i] : 0;
    return out;
  }
  /* which model to believe. The person model draws finer edges, but on a thing it leaves holes:
     it is taken when it covers (nearly) all that the general model found. */
  function choose(U, M) {
    var gw = 256, gh = 256, u = resize(U.d, U.w, U.h, gw, gh), m = resize(M.d, M.w, M.h, gw, gh), n = gw * gh;
    var au = 0, am = 0, both = 0, any = 0, onlyU = 0, i;
    for (i = 0; i < n; i++) {
      var a = u[i] > 0.5, b = m[i] > 0.5;
      if (a) au++; if (b) am++; if (a && b) both++; if (a || b) any++; if (a && !b) onlyU++;
    }
    var f = { iou: any ? both / any : 0, missed: au ? onlyU / au : 1, areaObject: au / n, areaPerson: am / n };
    if (f.areaObject < 0.002) f.pick = f.areaPerson > 0.01 ? 'person' : 'object';
    else f.pick = f.missed <= 0.09 && f.iou >= 0.6 ? 'person' : 'object';
    return f;
  }
  /* the small mask of a model -> a mask of the full picture whose edge follows the edges in the picture
     (guided filter, worked out on the smaller copy and applied at full size) */
  function refine(mask, low, full, W, H, kind) {
    var lw = low.w, lh = low.h, n = lw * lh, i;
    var p = despeckle(resize(mask.d, mask.w, mask.h, lw, lh), lw, lh);
    var I = new Float32Array(n), Ip = new Float32Array(n), II = new Float32Array(n);
    for (i = 0; i < n; i++) { I[i] = low.d[i] / 255; Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
    var r = Math.max(2, Math.round(Math.max(lw, lh) / 160)), eps = 1e-3;
    var mI = boxMean(I, lw, lh, r), mp = boxMean(p, lw, lh, r), mIp = boxMean(Ip, lw, lh, r), mII = boxMean(II, lw, lh, r);
    var a = new Float32Array(n), b = new Float32Array(n);
    for (i = 0; i < n; i++) { var cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i]; a[i] = cov / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
    Ip = II = mI = mp = mIp = mII = null;
    a = boxMean(a, lw, lh, r); b = boxMean(b, lw, lh, r);
    var gain = kind === 'person' ? 1.45 : 1.7, out = new Uint8Array(W * H);
    var fx = lw / W, fy = lh / H, x, y, X0 = new Int32Array(W), X1 = new Int32Array(W), TX = new Float32Array(W);
    for (x = 0; x < W; x++) {
      var sx = (x + 0.5) * fx - 0.5; if (sx < 0) sx = 0; if (sx > lw - 1) sx = lw - 1;
      X0[x] = Math.floor(sx); X1[x] = Math.min(lw - 1, X0[x] + 1); TX[x] = sx - X0[x];
    }
    for (y = 0; y < H; y++) {
      var sy = (y + 0.5) * fy - 0.5; if (sy < 0) sy = 0; if (sy > lh - 1) sy = lh - 1;
      var y0 = Math.floor(sy), y1 = Math.min(lh - 1, y0 + 1), ty = sy - y0, r0 = y0 * lw, r1 = y1 * lw, o = y * W;
      for (x = 0; x < W; x++) {
        var tx = TX[x], c0 = r0 + X0[x], c1 = r0 + X1[x], c2 = r1 + X0[x], c3 = r1 + X1[x];
        var av = (a[c0] + (a[c1] - a[c0]) * tx) * (1 - ty) + (a[c2] + (a[c3] - a[c2]) * tx) * ty;
        var bv = (b[c0] + (b[c1] - b[c0]) * tx) * (1 - ty) + (b[c2] + (b[c3] - b[c2]) * tx) * ty;
        var pv = (p[c0] + (p[c1] - p[c0]) * tx) * (1 - ty) + (p[c2] + (p[c3] - p[c2]) * tx) * ty;
        var q = av * full[o + x] / 255 + bv;
        if (pv < 0.004) q = 0;                              // nothing was found here at all: stays empty
        q = (q - 0.5) * gain + 0.5;
        out[o + x] = q <= 0 ? 0 : q >= 1 ? 255 : Math.round(q * 255);
      }
    }
    return out;
  }

  async function cut(q, note) {
    note = note || function () {};
    var need = q.mode === 'auto' ? ['object', 'person'] : [q.mode === 'person' ? 'person' : 'object'];
    if (raw.key !== q.key) raw = { key: q.key };
    var total = 0, done = 0, k;
    for (k = 0; k < need.length; k++) if (!raw[need[k]] && !sessions[need[k]]) total += MODELS[need[k]].bytes;
    if (total && !G.ort) total += ENGINE.bytes;
    var onBytes = function (n) { done += n; note('load', Math.min(done, total || done), total || done); };
    for (k = 0; k < need.length; k++) {
      var kind = need[k];
      if (raw[kind]) continue;
      if (!sessions[kind]) { note('load', done, total || 1); await session(kind, onBytes); }
      note('find', k + 1, need.length);
      raw[kind] = kind === 'object' ? await runObject(q.obj, onBytes) : await runPerson(q.per.d, q.per.w, q.per.h, onBytes);
    }
    var pick = need[0], info = {};
    if (q.mode === 'auto') { info = choose(raw.object, raw.person); pick = info.pick; }
    note('edges', 0, 1);
    var alpha = refine(raw[pick], q.low, q.full, q.W, q.H, pick);
    return { alpha: alpha, pick: pick, info: info };
  }
  /* give the memory of the models back (the next cut loads them again) */
  async function release() {
    for (var k in sessions) { try { await sessions[k].release(); } catch (e) { /* already gone */ } }
    sessions = {}; raw = { key: null };
  }

  var RTAI = { cut: cut, release: release, _choose: choose, _refine: refine, _resize: resize, _boxMean: boxMean };
  if (inWorker) {
    G.onmessage = function (e) {
      var m = e.data || {};
      if (m.cmd === 'ping') { G.postMessage({ id: m.id, type: 'pong' }); return; }
      if (m.cmd !== 'cut') return;
      cut(m.q, function (stage, a, b) { G.postMessage({ id: m.id, type: 'note', stage: stage, a: a, b: b }); })
        .then(function (r) { G.postMessage({ id: m.id, type: 'done', alpha: r.alpha, pick: r.pick, info: r.info }, [r.alpha.buffer]); })
        .catch(function (err) { G.postMessage({ id: m.id, type: 'error', message: String((err && err.message) || err) }); });
    };
  } else G.RTAI = RTAI;
})(typeof self !== 'undefined' ? self : this);
