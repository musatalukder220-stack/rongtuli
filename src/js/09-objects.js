'use strict';
/* ============================================================
 * 09-objects.js : things that sit on top of the picture
 * Text, Sticker, Add Photo, the options bar of a selected
 * object, and the Layers list.
 * ============================================================ */
const TextTool = {};
const StickerTool = {};
const PhotoTool = {};
const ObjOpts = {};
const LayersPanel = {};
(function () {
  const h = U.h;

  /* centre of what is visible right now, in document coordinates */
  function viewCentre() {
    const c = View.toDoc(View.w / 2, View.h / 2);
    return [U.clamp(c[0], Doc.width * 0.1, Doc.width * 0.9), U.clamp(c[1], Doc.height * 0.1, Doc.height * 0.9)];
  }
  /* put a new layer on the canvas: frac = how much of the canvas it may cover */
  function place(l, frac, jitter) {
    const s = Layers.size(l), c = viewCentre();
    const k = Math.min(frac * Doc.width / s.w, frac * Doc.height / s.h);
    l.scaleX = l.scaleY = k;
    const j = jitter ? Math.min(Doc.width, Doc.height) * 0.06 : 0;
    l.x = c[0] + (Math.random() - 0.5) * j; l.y = c[1] + (Math.random() - 0.5) * j;
    return l;
  }
  function baseFloor(l) {                 // lowest place an ordinary layer may go: just above the background photo
    if (l.base) return 0;
    let f = 0;
    Doc.layers.forEach((q, i) => { if (q.base) f = i + 1; });
    return f;
  }

  /* ============================ TEXT ============================ */
  function editor(initial, done) {
    const ta = h('textarea', { class: 'te-in', placeholder: 'Type your text', rows: 5, spellcheck: 'false', autocapitalize: 'sentences', 'aria-label': 'Text' });
    ta.value = initial || '';
    const close = () => ov.remove();
    const ok = () => { const v = ta.value.replace(/\s+$/, ''); close(); done(v); };
    const ov = h('div', { class: 'te' },
      h('div', { class: 'te-top' }, UI.tbtn('close', 'Cancel', close), h('span', { text: initial ? 'Edit text' : 'Add text' }), UI.tbtn('check', 'Done', ok, 'ok')), ta);
    document.body.appendChild(ov);
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* ignore */ }
  }
  /* black text on a bright picture, white on a dark one */
  function autoColor() {
    try {
      const c = Doc.flatten({ maxDim: 48, fill: '#808080' }), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let s = 0, n = 0;
      for (let y = Math.floor(c.height * 0.3); y < c.height * 0.7; y++) for (let x = Math.floor(c.width * 0.15); x < c.width * 0.85; x++) {
        const i = (y * c.width + x) * 4; s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
      }
      return n && s / n > 165 ? '#000000' : '#ffffff';
    } catch (e) { return '#ffffff'; }
  }
  const shortName = (t) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > 22 ? s.slice(0, 21) + '…' : s || 'Text'; };

  /* preset: values for the new text (a callout passes its bubble and a dark colour) */
  TextTool.add = function (preset) {
    editor('', (text) => {
      if (!text) return;
      const l = Layers.text(text, Object.assign({ font: Fonts.defaultFor(text), color: autoColor(), name: shortName(text) }, preset || {}));
      const c = viewCentre(), s = Layers.size(l);
      let k = Math.max(Doc.width, Doc.height) * 0.075 / l.size;
      k = Math.min(k, Doc.width * 0.88 / s.w, Doc.height * 0.8 / s.h);
      l.scaleX = l.scaleY = k; l.x = c[0]; l.y = c[1];
      Doc.add(l); Doc.select(l.id); History.commit(); View.request();
    });
  };
  /* ready-made looks: [values for the new text, the name on the button] */
  TextTool.PRESETS = [
    [{ bubble: { kind: 'round', fill: '#ffffff', line: '#111111', lw: 4, tail: 'left' }, color: '#111111' }, 'Hello!'],
    [{ bubble: { kind: 'round', fill: '#ff5fa2', line: '#ffffff', lw: 4, tail: 'left' }, color: '#ffffff' }, 'Love'],
    [{ bubble: { kind: 'oval', fill: '#2f80ed', line: '', lw: 0, tail: 'none' }, color: '#ffffff' }, 'Amazing'],
    [{ bubble: { kind: 'cloud', fill: '#ffffff', line: '#111111', lw: 4, tail: 'left' }, color: '#333333' }, 'Thought'],
    [{ bubble: { kind: 'shout', fill: '#ffd23f', line: '#111111', lw: 5, tail: 'right' }, color: '#111111' }, 'Wow!'],
    [{ bubble: { kind: 'heart', fill: '#ff4d6d', line: '#ffffff', lw: 4, tail: 'none' }, color: '#ffffff' }, 'Heart'],
    [{ bubble: { kind: 'box', fill: '#111111', line: '', lw: 0, tail: 'none' }, color: '#ffffff' }, 'Black tag'],
    [{ color: '#ffffff', stroke: { on: true, color: '#111111', width: 6 } }, 'Outline text'],
    [{ color: '#ffd23f', shadow: { on: true, color: '#000000', blur: 14, dx: 0, dy: 4, opacity: 0.6 } }, 'Glow text']
  ];
  TextTool.edit = function (l) {
    editor(l.text, (text) => {
      const live = Doc.get(l.id);
      if (!live) return;
      if (!text) { Doc.remove(live.id); History.commit(); View.request(); return; }
      if (text === live.text) return;
      live.spans = TextRender.editSpans(live.spans, live.text, text);
      live.text = text; live.name = shortName(text); Layers.touch(live);
      History.commit(); View.request();
    });
  };

  /* ============================ STICKERS ============================ */
  const EMOJI = [
    ['😀', 'Smileys', '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😢 😭 😤 😡 🤯 😱 🥺 😴 🤔 🤗 🙄 😬 🤐 😷 🤠 👻 💀 🤖 👽 💩 😈'],
    ['👍', 'People', '👍 👎 👏 🙌 🙏 💪 👌 ✌️ 🤞 🤟 👋 🤝 ✍️ 👀 🧠 💃 🕺 👑 🎩 👓 🕶️ 💍 💄 👗 👟 🎒 👶 👦 👧 👨 👩 👴 👵 👮 👷 🤴 👸 🧕 🤵 👰'],
    ['❤️', 'Love', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💞 💓 💗 💖 💘 💝 💟 ❣️ 😻 💋 💌 🌹 💐 🥀 💑 💏 🫶 🤎'],
    ['🐶', 'Animals', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦅 🦉 🦋 🐝 🐞 🐢 🐍 🐙 🐬 🐳 🐟 🦄 🐴 🐘 🦒 🐅 🐐 🐄 🦜 🦚 🐇'],
    ['🍔', 'Food', '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🌶️ 🌽 🥕 🍞 🧀 🍗 🍔 🍟 🍕 🌭 🌮 🍜 🍚 🍛 🍣 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍦 ☕ 🍵 🥤 🍹'],
    ['🌸', 'Nature', '🌞 🌝 🌚 🌙 ⭐ 🌟 ✨ ⚡ 🔥 💧 🌈 ☀️ ⛅ ☁️ 🌧️ ❄️ ☃️ 🌊 🌸 🌺 🌻 🌼 🌷 🌱 🌿 🍀 🍁 🍂 🌴 🌵 🌲 🍄 🌍 🌕 💫 ☔'],
    ['🎉', 'Party', '🎉 🎊 🎈 🎁 🎀 🎆 🎇 🧨 🎃 🎄 🎅 🏆 🥇 🏅 🎖️ 🎵 🎶 🎤 🎧 🎸 🎹 🥁 🎬 🎮 🎯 🎲 ⚽ 🏏 🏀 🏐 🎾 🏸 🎨 🎭 🎪 🕋 🕌 🌙'],
    ['✈️', 'Travel', '🚗 🚕 🚌 🏍️ 🚲 ✈️ 🚀 🚁 ⛵ 🚢 🚂 🛺 🏠 🏡 🏢 🏰 🕌 🗼 🗽 ⛰️ 🏝️ 🏖️ 🌅 🌄 🌃 🗺️ 🧭 ⛺ 📷 📱 💻 ⌚ 💡 🔑 🎓 📚 ✏️ 💼 💰 💎'],
    ['✅', 'Symbols', '✅ ❌ ❗ ❓ ⚠️ 🚫 💯 🔴 🔵 ⚫ ⚪ 🔶 🔷 🔺 ▶️ ⏩ ➡️ ⬅️ ⬆️ ⬇️ ↗️ 🔄 ➕ ➖ ✖️ ♻️ 🔔 📣 📌 📍 🏁 🚩 🇧🇩 🆕 🆓 🔝 💢 💤 💥 💦']
  ];
  /* our own drawn stickers (they look the same on every phone) */
  const VEC = (function () {
    const star = (n, R, r, rot) => {
      const p = [];
      for (let i = 0; i < n * 2; i++) { const a = ((rot == null ? -90 : rot) + i * 180 / n) * Math.PI / 180, q = i % 2 ? r : R; p.push((50 + q * Math.cos(a)).toFixed(1) + ',' + (50 + q * Math.sin(a)).toFixed(1)); }
      return p.join(' ');
    };
    const g = (id, a, b) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
    const svg = (defs, body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">' + (defs ? '<defs>' + defs + '</defs>' : '') + body + '</svg>';
    const O = 'stroke="#fff" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';
    const two = (shapes, fill) => '<g fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">' + shapes + '</g><g fill="' + fill + '">' + shapes + '</g>';
    let rays = '';
    for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180; rays += '<line x1="' + (50 + 30 * Math.cos(a)).toFixed(1) + '" y1="' + (50 + 30 * Math.sin(a)).toFixed(1) + '" x2="' + (50 + 43 * Math.cos(a)).toFixed(1) + '" y2="' + (50 + 43 * Math.sin(a)).toFixed(1) + '"/>'; }
    let petals = '';
    for (let i = 0; i < 6; i++) petals += '<ellipse cx="50" cy="26" rx="14" ry="21" transform="rotate(' + (i * 60) + ' 50 50)"/>';
    const note = '<ellipse cx="28" cy="76" rx="14" ry="11"/><ellipse cx="72" cy="66" rx="14" ry="11"/><rect x="35" y="22" width="7" height="55"/><rect x="79" y="12" width="7" height="55"/><polygon points="35,22 86,12 86,28 35,38"/>';
    const cloud = '<circle cx="30" cy="60" r="20"/><circle cx="52" cy="44" r="25"/><circle cx="74" cy="58" r="19"/><rect x="30" y="56" width="44" height="24" rx="6"/>';
    return [
      svg(g('a', '#ff7a9c', '#e11d48'), '<path d="M50 90C20 68 7 50 7 32 7 18 18 9 30 9c9 0 16 5 20 13 4-8 11-13 20-13 12 0 23 9 23 23 0 18-13 36-43 58z" fill="url(#a)" ' + O + '/><ellipse cx="29" cy="28" rx="8" ry="5" fill="#fff" opacity=".45" transform="rotate(-35 29 28)"/>'),
      svg(g('a', '#fde047', '#f59e0b'), '<polygon points="' + star(5, 45, 19) + '" fill="url(#a)" ' + O + '/>'),
      svg(g('a', '#fb923c', '#ea580c'), '<polygon points="' + star(14, 46, 37) + '" fill="url(#a)" ' + O + '/>'),
      svg('', '<polygon points="' + star(10, 46, 29, -81) + '" fill="#fde047" stroke="#111" stroke-width="4" stroke-linejoin="round"/>'),
      svg(g('a', '#fffbd1', '#fde047'), '<path d="M50 5c4 30 15 41 45 45-30 4-41 15-45 45-4-30-15-41-45-45 30-4 41-15 45-45z" fill="url(#a)" ' + O + '/>'),
      svg('', '<path d="M15 12h70a9 9 0 0 1 9 9v38a9 9 0 0 1-9 9H47L27 88V68H15a9 9 0 0 1-9-9V21a9 9 0 0 1 9-9z" fill="#fff" stroke="#111" stroke-width="4" stroke-linejoin="round"/>'),
      svg('', '<g fill="#fff" stroke="#111" stroke-width="4"><ellipse cx="52" cy="40" rx="42" ry="30"/><circle cx="26" cy="78" r="8"/><circle cx="12" cy="92" r="4.500"/></g>'),
      svg(g('a', '#f472b6', '#db2777'), '<path d="M8 38h50V18l36 32-36 32V62H8z" fill="url(#a)" ' + O + '/>'),
      svg(g('a', '#fde047', '#f59e0b'), '<path d="M11 80L6 30l24 20 20-34 20 34 24-20-5 50z" fill="url(#a)" ' + O + '/><rect x="11" y="70" width="78" height="10" fill="#d97706"/><circle cx="50" cy="56" r="5" fill="#ef4444"/><circle cx="29" cy="60" r="3.500" fill="#3b82f6"/><circle cx="71" cy="60" r="3.500" fill="#3b82f6"/>'),
      svg(g('a', '#fde047', '#f59e0b'), '<polygon points="58,5 16,56 44,56 36,95 84,40 54,40" fill="url(#a)" ' + O + '/>'),
      svg('', '<g stroke="#fbbf24" stroke-width="6" stroke-linecap="round">' + rays + '</g><circle cx="50" cy="50" r="22" fill="#fde047" stroke="#f59e0b" stroke-width="3"/>'),
      svg(g('a', '#fef3c7', '#fcd34d'), '<path d="M62 13.500A41 41 0 1 0 86 60 31 31 0 0 1 62 13.500z" fill="url(#a)" ' + O + '/>'),
      svg('', two(cloud, '#ffffff') + '<path d="M30 80h44a6 6 0 0 0 6-6v-4H24v4a6 6 0 0 0 6 6z" fill="#dbeafe"/>'),
      svg('', '<g fill="#f472b6" stroke="#fff" stroke-width="3">' + petals + '</g><circle cx="50" cy="50" r="13" fill="#fde047" stroke="#f59e0b" stroke-width="3"/>'),
      svg(g('a', '#f87171', '#dc2626'), '<path d="M5 34h90L83 50l12 16H5l12-16z" fill="url(#a)" ' + O + '/>'),
      svg('', '<circle cx="50" cy="50" r="43" fill="#22c55e" ' + O + '/><path d="M29 52l14 14 28-30" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'),
      svg('', '<circle cx="50" cy="50" r="43" fill="#ef4444" ' + O + '/><path d="M33 33l34 34M67 33L33 67" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>'),
      svg('', two(note, '#8b5cf6')),
      svg(g('a', '#f87171', '#dc2626'), '<path d="M50 95C30 66 18 52 18 37a32 32 0 0 1 64 0c0 15-12 29-32 58z" fill="url(#a)" ' + O + '/><circle cx="50" cy="37" r="12" fill="#fff"/>'),
      svg('', '<g fill="#111" stroke="#fff" stroke-width="3"><path d="M6 38h88v8H6z"/><rect x="10" y="40" width="34" height="26" rx="11"/><rect x="56" y="40" width="34" height="26" rx="11"/></g>'),
      svg('', '<path d="M8 60c22-16 42 10 84-14" fill="none" stroke="#f43f5e" stroke-width="12" stroke-linecap="round"/>'),
      svg('', '<path d="M50 9C26 7 8 26 9 50c1 25 22 43 44 41 23-2 40-21 38-44C89 26 73 12 54 12" fill="none" stroke="#fde047" stroke-width="7" stroke-linecap="round"/>'),
      svg(g('a', '#7dd3fc', '#2563eb'), '<polygon points="50,6 92,36 50,95 8,36" fill="url(#a)" ' + O + '/><path d="M8 36h84M30 36l20-30 20 30-20 59z" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>'),
      svg('', '<g fill="none" stroke-width="8" stroke-linecap="butt"><path d="M8 78a42 42 0 0 1 84 0" stroke="#ef4444"/><path d="M16 78a34 34 0 0 1 68 0" stroke="#f59e0b"/><path d="M24 78a26 26 0 0 1 52 0" stroke="#22c55e"/><path d="M32 78a18 18 0 0 1 36 0" stroke="#3b82f6"/></g>'),
      svg(g('a', '#f87171', '#dc2626'), '<ellipse cx="50" cy="38" rx="30" ry="34" fill="url(#a)" ' + O + '/><path d="M50 72l-5 8h10z" fill="#dc2626"/><path d="M50 80c-6 6 6 8 0 16" fill="none" stroke="#ddd" stroke-width="2.500" stroke-linecap="round"/><ellipse cx="39" cy="25" rx="6" ry="9" fill="#fff" opacity=".4" transform="rotate(25 39 25)"/>')
    ];
  })();
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  function emojiCanvas(ch) {
    const S = 300, c = U.canvas(S, S), x = c.getContext('2d');
    x.font = '200px ' + EMOJI_FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000';
    x.fillText(ch, S / 2, S / 2 + 8);
    const t = U.trimCanvas(c, 2);
    return t ? t.canvas : null;
  }
  function addSticker(canvas, name) {
    const l = place(Layers.image(canvas, { name: name || 'Sticker' }), 0.3, true);
    Doc.add(l); Doc.select(l.id); History.commit(); View.request();
  }
  /* a picture from the web, as a canvas (at most 1024 px). Fetched first, so the canvas stays clean. */
  async function fetchOnlineImage(url) {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const obj = URL.createObjectURL(blob);
    try {
      const im = await U.loadImage(obj);
      const k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = U.canvas(Math.max(1, Math.round(im.naturalWidth * k)), Math.max(1, Math.round(im.naturalHeight * k)));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(obj); }
  }
  const ONLINE_CACHE = new Map();      // word -> pictures, kept while the app is open
  StickerTool.open = function () {
    const tabs = h('div', { class: 'st-tabs' }), grid = h('div', { class: 'st-grid' });
    const sh = UI.sheet('Stickers', h('div', null, tabs, grid));
    let cur = -1;
    function show(i) {
      cur = i;
      Array.from(tabs.children).forEach((t, k) => t.classList.toggle('on', k === i + 1));
      U.clear(grid);
      grid.className = 'st-grid';
      if (i < 0) {
        VEC.forEach((s) => {
          const b = h('button', { class: 'st-cell', type: 'button', 'aria-label': 'Sticker' }, h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s), alt: '', draggable: 'false' }));
          U.onTap(b, async () => {
            try { const c = await U.svgToCanvas(s, 512); const t = U.trimCanvas(c, 2); sh.close(); addSticker(t ? t.canvas : c); }
            catch (e) { U.toast('Could not add this sticker'); }
          });
          grid.appendChild(b);
        });
        return;
      }
      for (const ch of EMOJI[i][2].split(' ')) {
        const b = h('button', { class: 'st-cell', type: 'button', text: ch, 'aria-label': 'Sticker ' + ch });
        U.onTap(b, () => {
          const c = emojiCanvas(ch);
          if (!c) { U.toast('This phone cannot draw that sticker'); return; }
          sh.close(); addSticker(c);
        });
        grid.appendChild(b);
      }
    }
    function showOnline() {
      Array.from(tabs.children).forEach((t) => t.classList.remove('on'));
      tabs.children[tabs.children.length - 1].classList.add('on');
      U.clear(grid);
      grid.className = 'st-grid online';
      const inp = h('input', { class: 'st-search', type: 'search', placeholder: 'Search pictures…', 'aria-label': 'Search pictures' });
      const go = h('button', { class: 'btn pri st-go', type: 'button', text: 'Search' });
      const msg = h('p', { class: 'panel-note st-online-note', text: 'Free pictures from the web (Openverse, Creative Commons). Tap one to add it as a sticker.' });
      const results = h('div', { class: 'st-photos' });
      grid.appendChild(h('div', { class: 'st-online' }, inp, go));
      grid.appendChild(msg);
      grid.appendChild(results);
      const run = async () => {
        const q = inp.value.trim();
        if (!q) return;
        U.clear(results);
        msg.textContent = 'Searching…';
        try {
          let list = ONLINE_CACHE.get(q);                 // the free search allows only a few hundred a day, so a word is fetched once
          if (!list) {
            const r = await fetch('https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) + '&page_size=24');
            if (r.status === 429) { msg.textContent = 'Too many searches for today — please try again later.'; return; }
            if (!r.ok) throw new Error('Search failed');
            const j = await r.json();
            list = (j.results || []).filter((x) => x.url).map((x) => ({ url: x.url, thumb: x.thumbnail || x.url, title: x.title || '' }));
            ONLINE_CACHE.set(q, list);
          }
          if (!list.length) { msg.textContent = 'Nothing found for “' + q + '”. Try another word.'; return; }
          msg.textContent = list.length + ' pictures — tap one to add it.';
          for (const x of list) {
            const b = h('button', { class: 'st-cell', type: 'button', 'aria-label': x.title || 'Picture', title: x.title || '' });
            b.appendChild(h('img', { src: x.thumb, alt: '', draggable: 'false', loading: 'lazy' }));
            U.onTap(b, async () => {
              try {
                U.toast('Adding…');
                const c = await fetchOnlineImage(x.url);
                if (!c) { U.toast('That picture could not be used'); return; }
                const t = U.trimCanvas(c, 2);
                sh.close(); addSticker(t ? t.canvas : c);
              } catch (e) { U.toast('Could not add that picture'); }
            });
            results.appendChild(b);
          }
        } catch (e) {
          msg.textContent = 'No internet, or the search did not work. Check your connection and try again.';
        }
      };
      U.onTap(go, run);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    }
    const tab = (icon, label, fn) => { const b = h('button', { class: 'st-tab', type: 'button', title: label, 'aria-label': label }, icon); U.onTap(b, fn); tabs.appendChild(b); return b; };
    tab(h('small', { text: '★ Shapes' }), 'Shapes', () => show(-1));
    EMOJI.forEach((e, i) => tab(e[0], e[1], () => show(i)));
    tab(h('small', { text: '+ Gallery' }), 'From gallery', async () => {
      const files = await U.pickFiles('image/*', false);
      if (!files.length) return;
      try { const c = await U.fileToCanvas(files[0], 1024); sh.close(); addSticker(c); } catch (e) { U.toast(e.message || 'Could not open this picture'); }
    });
    tab(h('small', { text: '🌐 Online' }), 'Online pictures', () => showOnline());
    show(-1);
  };

  /* ============================ ADD PHOTO ============================ */
  PhotoTool.add = async function () {
    const files = await U.pickFiles('image/*', true);
    if (!files.length) return;
    let ok = 0, last = null;
    await U.busy(async () => {
      for (const f of files.slice(0, 10)) {
        try {
          const c = await U.fileToCanvas(f, 1600);
          last = place(Layers.image(c, { name: 'Photo' }), 0.7, ok > 0);
          Doc.add(last); ok++;
        } catch (e) { console.error(e); }
      }
    }, 'Adding…');
    if (!ok) { U.toast('Could not open this picture'); return; }
    Doc.select(last.id); History.commit(); View.request();
  };
  PhotoTool.addCanvas = function (c, name) {
    const l = place(Layers.image(c, { name: name || 'Photo' }), 0.7, false);
    Doc.add(l); Doc.select(l.id); History.commit(); View.request();
    return l;
  };

  /* ============================ OPTIONS OF THE SELECTED OBJECT ============================ */
  ObjOpts.items = function (l) {
    const commit = () => History.commit();
    const touch = () => { Layers.touch(l); View.request(); };
    const P = (id, icon, label, build) => ({ id: id, icon: icon, label: label, onTap: () => UI.togglePanel(id, build) });
    const A = (id, icon, label, fn, x) => Object.assign({ id: id, icon: icon, label: label, onTap: fn }, x || {});
    const pad = (...kids) => h('div', { class: 'panel-pad' }, kids);
    const S = (label, min, max, value, set, x) => UI.slider(Object.assign({ label: label, min: min, max: max, value: value, onInput: (v) => { set(v); touch(); }, onChange: commit }, x || {}));
    const items = [];

    if (l.locked) items.push(A('unlock', 'unlock', 'Unlock', () => { l.locked = false; commit(); UI.refreshContext(); U.toast('Unlocked — it can be moved now'); }));

    if (l.type === 'text') {
      /* the words move left / right, as a % of the picture's width (PixelLab style):
         Nudge shows the arrows and how far the words have gone — tap a % to go back to the middle */
      const nudgeRow = () => {
        const val = h('span', { class: 'sl-v', text: '%' });
        const show = () => { val.textContent = (l.nudge >= 0 ? '+' : '') + l.nudge + '%'; };
        const stepOf = (dir) => {
          const step = UI.nudgeStep ? UI.nudgeStep() : 5;
          l.nudge = U.clamp(Math.round((l.nudge || 0) + dir * step), -100, 100);   // (never further than the picture)
          Layers.touch(l); View.request(); show(); commit();
        };
        const L = h('button', { class: 'btn sz-b', type: 'button', text: '←', 'aria-label': 'Left', id: 'tx-left' });
        const R = h('button', { class: 'btn sz-b', type: 'button', text: '→', 'aria-label': 'Right', id: 'tx-right' });
        U.onTap(L, () => stepOf(-1)); U.onTap(R, () => stepOf(1));
        const mid = h('button', { class: 'btn sz-b', type: 'button', text: 'Middle', 'aria-label': 'Back to the middle', id: 'tx-nudge-0' });
        U.onTap(mid, () => { l.nudge = 0; Layers.touch(l); View.request(); show(); commit(); });
        show();
        for (const el of [L, R, mid]) { el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); }
        return h('div', { class: 'nudge' },
          h('div', { class: 'sz-row' }, L, h('div', { class: 'sz-sl' }, h('div', { class: 'sub-h', text: 'Nudge left / right' }), val), R),
          h('div', { class: 'chips' }, mid));
      };
      const sizeRow = () => {
        /* the size of the words: a slider, and − / + for one step at a time */
        const val = h('span', { class: 'sl-v' });
        const bump = (d) => { l.size = U.clamp(Math.round(l.size * (d > 0 ? 1.12 : 1 / 1.12)), 8, 900); Layers.touch(l); View.request(); val.textContent = String(Math.round(l.size)); };
        const inp = h('input', { type: 'range', min: 8, max: 400, step: 1, value: U.clamp(Math.round(l.size), 8, 400), 'aria-label': 'Text size', id: 'tx-size' });
        const upd = () => { l.size = +inp.value; Layers.touch(l); View.request(); val.textContent = String(Math.round(l.size)); };
        inp.addEventListener('input', upd);
        let t0 = 0;
        inp.addEventListener('pointerdown', () => { t0 = Date.now(); });
        inp.addEventListener('change', () => { if (Date.now() - t0 > 60) commit(); });
        const minus = h('button', { class: 'btn sz-b', type: 'button', text: 'A−', 'aria-label': 'Smaller', id: 'tx-smaller' });
        const plus = h('button', { class: 'btn sz-b', type: 'button', text: 'A+', 'aria-label': 'Bigger', id: 'tx-bigger' });
        U.onTap(minus, () => { bump(-1); commit(); });
        U.onTap(plus, () => { bump(1); commit(); });
        val.textContent = String(Math.round(l.size));
        /* a finger on the slider must not also drag the text on the canvas */
        for (const el of [inp, minus, plus]) { el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); }
        return h('div', { class: 'sz-row' }, minus, h('div', { class: 'sz-sl' }, h('div', { class: 'sub-h', text: 'Size' }), inp), val, plus);
      };
      items.push(
        A('edit', 'edit', 'Edit', () => TextTool.edit(l)),
        P('textsize', 'font', 'Size', () => pad(sizeRow())),
        P('nudge', 'alignC', 'Nudge', () => pad(nudgeRow())),
        P('presets', 'callout', 'Style presets', () => {
          const wrap = h('div', { class: 'chips' });
          for (const pre of TextTool.PRESETS) {
            const b = h('button', { class: 'chip', type: 'button', text: pre[1] });
            U.onTap(b, () => TextTool.add(pre[0]));
            wrap.appendChild(b);
          }
          return pad(h('p', { class: 'panel-note', text: 'Ready-made labels — tap one and type your words.' }), wrap);
        }),
        P('font', 'font', 'Font', () => fontPanel()),
        P('color', 'color', 'Color', () => pad(UI.palette({ value: l.color, onPick: (c, fin) => { Layers.setTextStyle(l, 'color', c); touch(); if (fin) commit(); } }))),
        P('stroke', 'strokeA', 'Stroke', () => pad(
          UI.palette({ value: l.stroke.on ? l.stroke.color : 'none', none: true, onPick: (c, fin) => { l.stroke.on = true; l.stroke.color = c; touch(); if (fin) commit(); }, onNone: () => { l.stroke.on = false; touch(); commit(); } }),
          S('Width', 1, 30, l.stroke.width, (v) => { l.stroke.width = v; l.stroke.on = true; }))),
        P('shadow', 'shadow', 'Shadow', () => pad(
          UI.palette({ value: l.shadow.on ? l.shadow.color : 'none', none: true, onPick: (c, fin) => { l.shadow.on = true; l.shadow.color = c; touch(); if (fin) commit(); }, onNone: () => { l.shadow.on = false; touch(); commit(); } }),
          S('Blur', 0, 40, l.shadow.blur, (v) => { l.shadow.blur = v; l.shadow.on = true; }),
          S('Move X', -30, 30, l.shadow.dx, (v) => { l.shadow.dx = v; l.shadow.on = true; }, { resetTo: 0 }),
          S('Move Y', -30, 30, l.shadow.dy, (v) => { l.shadow.dy = v; l.shadow.on = true; }, { resetTo: 0 }),
          S('Strength', 0, 100, Math.round(l.shadow.opacity * 100), (v) => { l.shadow.opacity = v / 100; l.shadow.on = true; }))),
        P('highlight', 'highlight', 'Highlight', () => pad(
          UI.palette({ value: l.bg.on ? l.bg.color : 'none', none: true, onPick: (c, fin) => { l.bg.on = true; l.bg.color = c; touch(); if (fin) commit(); }, onNone: () => { l.bg.on = false; touch(); commit(); } }),
          S('Opacity', 0, 100, Math.round(l.bg.opacity * 100), (v) => { l.bg.opacity = v / 100; l.bg.on = true; }),
          S('Padding', 0, 80, l.bg.pad, (v) => { l.bg.pad = v; delete l.bg.pl; delete l.bg.pr; delete l.bg.pt; delete l.bg.pb; l.bg.on = true; }),
          S('Round', 0, 100, l.bg.radius, (v) => { l.bg.radius = v; l.bg.on = true; }),
          l.bend ? h('p', { class: 'panel-note', text: 'Highlight is hidden while the text is bent.' }) : null)),
        P('bubble', 'callout', 'Bubble', () => {
          const B = () => (l.bubble || (l.bubble = { kind: 'round', fill: '#ffffff', line: '#111111', lw: 5, tail: 'left' }));
          return pad(
            UI.chips([['none', 'None'], ['round', 'Rounded'], ['oval', 'Oval'], ['cloud', 'Thought'], ['shout', 'Shout'], ['box', 'Rect'], ['heart', 'Heart']], l.bubble ? l.bubble.kind : 'none',
              (v) => { if (v === 'none') delete l.bubble; else B().kind = v; touch(); commit(); }),
            UI.chips([['left', 'Tail left'], ['right', 'Tail right'], ['none', 'No tail']], l.bubble ? l.bubble.tail : 'left', (v) => { B().tail = v; touch(); commit(); }),
            h('div', { class: 'sub-h pl', text: 'Bubble colour' }),
            UI.palette({ value: l.bubble ? l.bubble.fill : '#ffffff', onPick: (c, fin) => { B().fill = c; touch(); if (fin) commit(); } }),
            h('div', { class: 'sub-h pl', text: 'Line' }),
            UI.palette({ value: l.bubble && l.bubble.line ? l.bubble.line : 'none', none: true, onPick: (c, fin) => { B().line = c; touch(); if (fin) commit(); }, onNone: () => { B().line = ''; touch(); commit(); } }),
            l.bend ? h('p', { class: 'panel-note', text: 'The bubble is hidden while the text is bent.' }) : null);
        }),
        P('opacity', 'opacity', 'Opacity', () => pad(UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(l.opacity * 100), onInput: (v) => { l.opacity = v / 100; View.request(); }, onChange: commit }))),
        P('style', 'styletext', 'Style', () => pad(
          h('div', { class: 'sub-h pl', text: 'Fill' }),
          UI.palette({ value: l.color, onPick: (c, fin) => { Layers.setTextStyle(l, 'color', c); touch(); if (fin) commit(); } }),
          h('div', { class: 'sub-h pl', text: 'Font' }),
          fontPanel(),
          UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(l.opacity * 100), onInput: (v) => { l.opacity = v / 100; View.request(); }, onChange: commit }),
          h('div', { class: 'sub-h pl', text: 'Blend' }),
          UI.chips(BLENDS, l.blend, (v) => { l.blend = v; View.request(); commit(); }))),
        P('bend', 'bend', 'Bend', () => {
          const arcRow = h('div');
          const fillArc = () => {
            U.clear(arcRow);
            if (!l.bend) { arcRow.appendChild(h('p', { class: 'panel-note', text: 'Set Bend first: the words then follow a circle, and Arc says how big that circle is.' })); return; }
            arcRow.appendChild(S('Arc', 0, 100, l.arc || 0, (v) => { l.arc = v; }, { resetTo: 0 }));
            arcRow.appendChild(h('p', { class: 'panel-note', text: '0 = a wide, gentle curve · 100 = a tight circle. Without touching it, the circle grows with the length of the line.' }));
          };
          fillArc();
          return pad(
            S('Bend', -100, 100, l.bend, (v) => { l.bend = v; if (!v) l.arc = 0; fillArc(); }, { resetTo: 0 }),
            arcRow);
        }),
        P('slant', 'rotL', 'Slant', () => pad(S('Slant', -60, 60, l.slant || 0, (v) => { l.slant = v; }, { resetTo: 0 }))),
        P('spacing', 'spacing', 'Spacing', () => pad(
          S('Letters', -10, 60, l.letterSpacing, (v) => { l.letterSpacing = v; }, { resetTo: 0 }),
          S('Lines', 70, 250, Math.round(l.lineHeight * 100), (v) => { l.lineHeight = v / 100; }, { resetTo: 125, fmt: (v) => (v / 100).toFixed(2) }))),
        P('align', 'alignC', 'Align', () => pad(UI.chips([['left', 'Left', 'alignL'], ['center', 'Centre', 'alignC'], ['right', 'Right', 'alignR']], l.align, (v) => { l.align = v; touch(); commit(); }),
          h('p', { class: 'panel-note', text: 'Shows on text with more than one line.' }))),
        P('format', 'format', 'Format', () => {
          const row = h('div', { class: 'chips' });
          for (const o of [['bold', 'Bold'], ['italic', 'Italic']]) {
            const b = h('button', { class: 'chip' + (l[o[0]] ? ' on' : ''), type: 'button', text: o[1] });
            U.onTap(b, () => { Layers.setTextStyle(l, o[0], !l[o[0]]); b.classList.toggle('on', l[o[0]]); touch(); commit(); });
            row.appendChild(b);
          }
          return pad(row);
        })
      );
    } else {
      if (l.shape) for (const it of ShapeTool.items(l, P, pad, commit)) items.push(it);   // (only old projects have these)
      items.push(
        P('opacity', 'opacity', 'Opacity', () => pad(UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(l.opacity * 100), onInput: (v) => { l.opacity = v / 100; View.request(); }, onChange: commit }))),
        A('crop', 'crop', 'Crop', () => LayerCrop.open(l)),
        A('shapecrop', 'shapecrop', 'Shape Crop', () => ShapeCrop.open(l)),
        A('removebg', 'removebg', 'Remove BG', () => Cutout.open(l, 'auto')),
        A('remove', 'removeobj', 'Remove', () => RemoveTool.open(l)),
        A('cutout', 'cutout', 'Cutout', () => Cutout.open(l, 'around')),
        A('eraser', 'eraser', 'Eraser', () => Cutout.open(l, 'erase')),
        A('adjust', 'adjust', 'Adjust', () => AdjustTool.open(l)),
        A('effects', 'effects', 'Effects', () => EffectsTool.open(l)),
        A('curves', 'curves', 'Curves', () => CurvesTool.open(l)),
        A('moretools', 'tools', 'Tools', () => {
          // the tools of the Tools grid that work on one picture, for this photo
          const grid = h('div', { class: 'tools-grid' });
          const sh = UI.sheet('Tools for this photo', grid);
          const LIST = [['retouch', 'Retouch', () => RetouchTool.open(l)], ['enhance', 'Enhance', () => EnhanceTool.open(l)], ['tiltshift', 'Tilt Shift', () => TiltShiftTool.open(l)],
            ['perspective', 'Perspective', () => PerspectiveTool.open(l)], ['motion', 'Motion', () => MotionTool.open(l)], ['stretch', 'Stretch', () => StretchTool.open(l)],
            ['clone', 'Clone', () => CloneTool.open(l)], ['dispersion', 'Dispersion', () => DispersionTool.open(l)]];
          for (const t of LIST) {
            const b = h('button', { class: 'tool-cell', type: 'button', 'data-id': t[0] }, I.el(t[0]), h('span', { text: t[1] }));
            U.onTap(b, () => { sh.close(); t[2](); });
            grid.appendChild(b);
          }
        }),
        A('flipH', 'flipH', 'Flip H', () => { l.flipH = !l.flipH; View.request(); commit(); }),
        A('flipV', 'flipV', 'Flip V', () => { l.flipV = !l.flipV; View.request(); commit(); })
      );
    }
    items.push(P('blend', 'blend', 'Blend', () => pad(UI.chips(BLENDS, l.blend, (v) => { l.blend = v; View.request(); commit(); }))));
    if (l.type === 'image') {
      items.push(P('imgoutline', 'strokeA', 'Outline', () => pad(
        UI.palette({ value: (l.outline && l.outline.color) || 'none', none: true,
          onPick: (c, fin) => { l.outline = { color: c, width: (l.outline && l.outline.width) || 6 }; View.request(); if (fin) commit(); },
          onNone: () => { delete l.outline; View.request(); commit(); } }),
        S('Thickness', 1, 40, (l.outline && l.outline.width) || 6, (v) => { l.outline = { color: (l.outline && l.outline.color) || '#ffffff', width: v }; View.request(); }, { resetTo: 6 }))));
      items.push(P('style', 'styletext', 'Style', () => pad(
        UI.slider({ label: 'Opacity', min: 0, max: 100, value: Math.round(l.opacity * 100), onInput: (v) => { l.opacity = v / 100; View.request(); }, onChange: commit }),
        h('div', { class: 'sub-h pl', text: 'Blend' }),
        UI.chips(BLENDS, l.blend, (v) => { l.blend = v; View.request(); commit(); }))));
    }
    items.push({ sep: true });
    items.push(A('dup', 'copy', 'Duplicate', () => { const c = Doc.duplicate(l.id); if (c) { Doc.select(c.id); commit(); View.request(); } }));
    if (!l.base) {
      items.push(
        A('front', 'front', 'Forward', () => { if (Doc.reorder(l.id, 1)) { commit(); View.request(); } else U.toast('Already at the front'); }),
        A('back', 'backward', 'Backward', () => { if (Doc.index(l.id) > baseFloor(l) && Doc.reorder(l.id, -1)) { commit(); View.request(); } else U.toast('Already at the back'); }));
    }
    if (!l.locked) items.push(A('lock', 'lock', 'Lock', () => { l.locked = true; commit(); UI.refreshContext(); U.toast('Locked — open Layers to pick it again'); }));
    items.push(A('del', 'trash', 'Delete', () => { Doc.remove(l.id); commit(); View.request(); }, { danger: true }));
    return items;

    function fontPanel() {
      const wrap = h('div', { class: 'fonts' });
      const build = () => {
        U.clear(wrap);
        const add = h('button', { class: 'fchip', type: 'button' }, '+ Font', h('small', { text: 'add .ttf / .otf' }));
        U.onTap(add, async () => {
          const files = await U.pickFiles('', true);
          if (!files.length) return;
          let name = null;
          for (const f of files) {
            try { name = await Fonts.addFile(f); Fonts.keep(name); }        // kept for next time, not only this session
            catch (e) { U.toast('"' + f.name + '" is not a font this browser can use'); }
          }
          if (name) { Layers.setTextStyle(l, 'font', name); touch(); commit(); build(); }
        });
        wrap.appendChild(add);
        const bn = Fonts.isBengali(l.text);
        const order = bn ? ['my', 'bn', 'en', 'sys'] : ['my', 'en', 'bn', 'sys'];
        const list = Fonts.list.slice().sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
        for (const f of list) {
          const b = h('button', { class: 'fchip' + (l.font === f.family ? ' on' : ''), type: 'button', style: { fontFamily: Fonts.css(f.family) }, 'data-font': f.family },
            f.group === 'bn' ? 'বাংলা লেখা' : f.label, f.group === 'bn' ? h('small', { text: f.label }) : null);
          U.onTap(b, () => { Layers.setTextStyle(l, 'font', f.family); for (const c of wrap.children) c.classList.toggle('on', c === b); touch(); commit(); });
          if (f.group === 'my' && Fonts.custom[f.family]) {
            /* hold a font of your own to take it out of the list */
            let held = null;
            const start = () => { held = setTimeout(async () => {
              held = null;
              const yes = await UI.confirm('Remove this font?', '"' + f.label + '" is taken out of the font list (texts already written with it change to the normal font).', 'Remove', 'Keep');
              if (yes) { await Fonts.forget(f.family); build(); }
            }, 650); };
            const stop = () => { if (held) { clearTimeout(held); held = null; } };
            b.addEventListener('pointerdown', start); b.addEventListener('pointerup', stop);
            b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
          }
          wrap.appendChild(b);
        }
      };
      build();
      requestAnimationFrame(() => { const on = wrap.querySelector('.fchip.on'); if (on) wrap.scrollLeft = Math.max(0, on.offsetLeft - wrap.clientWidth / 2 + on.offsetWidth / 2); });
      return h('div', { class: 'panel-pad' }, wrap);
    }
  };

  /* ============================ LAYERS LIST ============================ */
  LayersPanel.open = function () {
    const acts = h('div', { class: 'ly-acts' }), list = h('div');
    const sh = UI.sheet('Layers', h('div', null, acts, list));
    const TYPE = { image: 'Picture', text: 'Text' };
    function refresh() {
      if (sh.closed) return;
      U.clear(acts); U.clear(list);
      const sel = Doc.selected();
      const act = (icon, title, fn, on) => { const b = UI.ibtn(icon, title, () => { fn(); refresh(); View.request(); }); if (!on) { b.classList.add('off'); b.disabled = true; } acts.appendChild(b); };
      const i = sel ? Doc.index(sel.id) : -1, movable = !!sel && !sel.base;
      act('up', 'Move forward', () => { if (Doc.reorder(sel.id, 1)) History.commit(); }, movable && i < Doc.layers.length - 1);
      act('down', 'Move backward', () => { if (Doc.reorder(sel.id, -1)) History.commit(); }, movable && i > baseFloor(sel));
      act('copy', 'Duplicate', () => { const c = Doc.duplicate(sel.id); if (c) { Doc.select(c.id); History.commit(); } }, !!sel);
      act('trash', 'Delete', () => { Doc.remove(sel.id); History.commit(); }, !!sel);
      const merge = h('button', { class: 'chip', type: 'button', text: 'Merge all', style: 'align-self:center' });
      U.onTap(merge, async () => {
        if (Doc.layers.length < 2) { U.toast('There is only one layer'); return; }
        if (!(await UI.confirm('Merge all layers?', 'Text and stickers become part of the picture and can no longer be moved. Undo brings them back.', 'Merge'))) return;
        const c = Doc.flatten({});
        Doc.layers = [Layers.image(c, { name: 'Background', x: Doc.width / 2, y: Doc.height / 2, locked: true, base: true })];
        Doc.select(null); History.commit(); refresh(); View.request();
      });
      acts.appendChild(merge);
      if (!Doc.layers.length) { list.appendChild(h('div', { class: 'empty', text: 'Nothing here yet. Add a photo, text or sticker.' })); return; }
      for (let k = Doc.layers.length - 1; k >= 0; k--) {
        const l = Doc.layers[k];
        const row = h('div', { class: 'ly' + (sel && sel.id === l.id ? ' on' : ''), 'data-id': l.id },
          Layers.thumb(l, 92), h('div', { class: 'nm' }, l.name || TYPE[l.type], h('small', { text: (TYPE[l.type] || '') + (l.base ? ' · background' : '') })),
          UI.ibtn(l.visible ? 'eye' : 'eyeoff', l.visible ? 'Hide' : 'Show', () => { l.visible = !l.visible; History.commit(); refresh(); View.request(); }, l.visible ? '' : 'off'),
          UI.ibtn(l.locked ? 'lock' : 'unlock', l.locked ? 'Unlock' : 'Lock', () => { l.locked = !l.locked; History.commit(); refresh(); UI.refreshContext(); }, l.locked ? '' : 'off'));
        row.addEventListener('click', (e) => { if (e.target.closest('.ibtn')) return; Doc.select(sel && sel.id === l.id ? null : l.id); refresh(); });
        list.appendChild(row);
      }
    }
    refresh();
  };
})();
