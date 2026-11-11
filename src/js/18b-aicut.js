/* AI background removal – the page side.
 *
 * The models live in the folder "ai" next to the page (see src/ai/rtai.js and tools/fetch_ai.py); they run on the
 * device itself, no picture leaves it. Without that folder – or when the page is opened as a plain file – AICut.ready()
 * stays false and Remove BG works with the plain-colour method only.
 *
 *   AICut.check()                       -> Promise<boolean>: is the add-on there? (asked once, at start)
 *   AICut.ready()                       -> the answer, false while not known
 *   AICut.cut({canvas, data, key, mode}, say) -> { alpha: Uint8Array(w * h), pick: 'person' | 'object', info }
 *        mode 'auto' | 'person' | 'object'; key: one name per picture (the models' answers are kept for it)
 *   AICut.stop()                        -> gives the memory back
 *   AICut.mustDownload()                -> Promise<boolean>: on the web the engine and models are downloaded on first use;
 *                                          ask the user before that (AICut.agree() remembers the yes). Never true in the Android app.
 */
const AICut = {};
(function () {
  const DIR = 'ai/', IDLE = 120000;
  let have = null, worker = null, direct = false, seq = 0, idleTimer = null;
  const waiting = new Map();

  AICut.possible = () => /^https?:$/.test(location.protocol) && !U.sandboxed() && typeof WebAssembly === 'object';
  AICut.check = async function () {
    if (have !== null) return have;
    if (!AICut.possible()) { have = false; return have; }
    try {
      const r = await fetch(DIR + 'manifest.json', { cache: 'no-store' });
      const m = r.ok ? await r.json() : null;
      AICut.info = m;
      have = !!(m && m.ready);
    } catch (e) { have = false; }
    return have;
  };
  AICut.ready = () => have === true;
  /* size of the engine and the models together, in MB */
  AICut.megabytes = () => { let n = 0; const f = (AICut.info && AICut.info.files) || {}; for (const k in f) n += f[k]; return Math.max(1, Math.round(n / 1048576)); };
  const OK_KEY = 'rt-ai-ok';
  AICut.mustDownload = async function () {
    if (Native.on) return false;                                   // the Android app carries the files
    try { if (localStorage.getItem(OK_KEY) === '1') return false; } catch (e) { /* no storage here: ask */ }
    try {
      const c = await caches.open('rongtuli-ai-1');                // where sw.js keeps them
      const at = (n) => new URL(DIR + n, location.href).href;
      if (await c.match(at('modnet.onnx')) && await c.match(at('u2netp.onnx')) && await c.match(at('ort-wasm-simd.wasm'))) return false;
    } catch (e) { /* no cache here */ }
    return true;
  };
  AICut.agree = () => { try { localStorage.setItem(OK_KEY, '1'); } catch (e) { /* asked again next time */ } };
  AICut.mode = () => (direct ? 'page' : 'worker');

  function failAll(msg) {
    for (const w of waiting.values()) w.reject(new Error(msg));
    waiting.clear();
  }
  function onMsg(e) {
    const m = e.data || {}, w = waiting.get(m.id);
    if (!w) return;
    if (m.type === 'note') { if (w.note) w.note(m.stage, m.a, m.b); }
    else if (m.type === 'done') w.resolve({ alpha: m.alpha, pick: m.pick, info: m.info });
    else if (m.type === 'error') w.reject(new Error(m.message || 'the AI stopped'));
  }
  function startWorker() {
    return new Promise((resolve) => {
      let w = null, done = false, t = null;
      const fail = () => { if (done) return; done = true; clearTimeout(t); try { if (w) w.terminate(); } catch (e) { /* gone */ } resolve(null); };
      try { w = new Worker(DIR + 'rtai.js'); } catch (e) { fail(); return; }
      t = setTimeout(fail, 8000);
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); fail(); };
      w.onmessage = (e) => {
        if (done || !e.data || e.data.type !== 'pong') return;
        done = true; clearTimeout(t);
        w.onmessage = onMsg;
        w.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); failAll('the AI ran out of memory or stopped'); if (worker === w) worker = null; };
        resolve(w);
      };
      w.postMessage({ cmd: 'ping', id: 0 });
    });
  }
  AICut.stop = function () {
    clearTimeout(idleTimer);
    if (worker) { try { worker.terminate(); } catch (e) { /* gone */ } worker = null; failAll('stopped'); }
    else if (direct && window.RTAI) window.RTAI.release();
  };
  function loadScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.onload = () => res(); s.onerror = () => rej(new Error('could not load ' + url));
      document.head.appendChild(s);
    });
  }
  async function call(q, transfer, note) {
    clearTimeout(idleTimer);
    if (!direct && !worker) { worker = await startWorker(); if (!worker) direct = true; }
    if (direct) {
      if (!window.RTAI) await loadScript(DIR + 'rtai.js');
      await U.nextFrame();
      return window.RTAI.cut(q, note);
    }
    const id = ++seq;
    try {
      return await new Promise((resolve, reject) => {
        waiting.set(id, { resolve: resolve, reject: reject, note: note });
        worker.postMessage({ cmd: 'cut', id: id, q: q }, transfer);
      });
    } finally { waiting.delete(id); idleTimer = setTimeout(AICut.stop, IDLE); }
  }
  /* the small copies of the picture that the models and the edge step need */
  function prepare(o) {
    const src = o.canvas, W = src.width, H = src.height;
    const flat = (w, h) => {
      const c = U.canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, w, h);
      return x.getImageData(0, 0, w, h).data;
    };
    const lum = (d, n) => { const out = new Uint8Array(n); for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; return out; };
    let k = 512 / Math.min(W, H), pw = W * k, ph = H * k;      // the person model: short side 512, long side not over the cap
    const cap = LOW_MEM ? 768 : 1024;
    if (Math.max(pw, ph) > cap) { const s = cap / Math.max(pw, ph); pw *= s; ph *= s; }
    pw = Math.max(64, Math.round(pw / 32) * 32); ph = Math.max(64, Math.round(ph / 32) * 32);
    const lk = Math.min(1, 1024 / Math.max(W, H)), lw = Math.max(1, Math.round(W * lk)), lh = Math.max(1, Math.round(H * lk));
    return {
      key: o.key, mode: o.mode, W: W, H: H,
      obj: flat(320, 320),
      per: { w: pw, h: ph, d: flat(pw, ph) },
      low: { w: lw, h: lh, d: lum(lw === W && lh === H && o.data ? o.data : flat(lw, lh), lw * lh) },
      full: lum(o.data || flat(W, H), W * H)
    };
  }
  const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
  function words(stage, a, b) {
    if (stage === 'load') return b > 1 ? 'Loading the AI… ' + mb(a) + ' of ' + mb(b) + ' MB' : 'Loading the AI…';
    if (stage === 'find') return b > 1 ? 'Looking at the picture… ' + a + ' of ' + b : 'Looking at the picture…';
    return 'Cleaning the edges…';
  }
  AICut.cut = async function (o, say) {
    AICut._busy = true;                                  // the background save waits while the AI works
    const attempt = () => {
      const q = prepare(o);
      return call(q, direct ? [] : [q.obj.buffer, q.per.d.buffer, q.low.d.buffer, q.full.buffer], (stage, a, b) => { if (say) say(words(stage, a, b)); });
    };
    try {
      try { return await attempt(); }
      catch (e) {
        if (direct || /stopped$/.test(String(e && e.message))) throw e;
        console.warn('AI worker failed, trying on the page itself:', e && e.message);      // some web views cannot give a worker its files
        AICut.stop(); direct = true;
        return await attempt();
      }
    } finally { AICut._busy = false; }
  };
  AICut.running = () => AICut._busy === true;
})();
