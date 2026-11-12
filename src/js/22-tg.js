'use strict';
/* ============================================================
 * 22-tg.js : the update news, read straight from the Telegram channel.
 *
 * Why: the owner must be able to bring out a new version WITHOUT any computer, any GitHub,
 * any assistant — only the phone and the Telegram app.
 *
 * Every release is ONE post in the channel, and its first lines are written in a fixed way:
 *
 *     RongTuli 0.12
 *     Better Remove, new frames
 *     https://www.mediafire.com/file/xxxx/RongTuli-0.12.apk
 *
 * Then this file, on every start (at most once a day):
 *   * opens the channel's public page      https://t.me/s/<channel>   (Telegram's own web view,
 *     which needs no app key and no login),
 *   * reads the newest posts, finds the first line that looks like  <name> <version>,
 *   * takes the line under it as the note, and the first http(s) link as the download,
 *   * if that version is newer than this app, the home page shows a strip and the Update sheet appears.
 *
 * The download link may be MediaFire, Google Drive, Dropbox, a Telegram post, anything that
 * starts with https:// — the user taps it and their browser downloads the .apk.
 * ============================================================ */
const TgNews = {};
(function () {
  /* the app's names, as they may be written in a post (any letter case, with a space, in Bengali) */
  TgNews.names = ['RongTuli', 'Rong Tuli', 'রংতুলি'];
  const KEY = 'rt-tg-check', SEEN = 'rt-tg-seen';
  const SOON = 8 * 60 * 1000;                              // look again when the app is opened; 8 minutes is plenty

  /* the channel, as the owner types it: "@rongtuli_app", "rongtuli_app" or a full link */
  TgNews.channel = function () {
    let c = String(TgNews.channelId || '').trim();
    c = c.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^s\//, '').replace(/^@/, '').replace(/\/.*$/, '');
    return c;
  };
  TgNews.channelId = 'rongtuli_app';                     // ← the owner changes only this line
  TgNews.url = () => 'https://t.me/s/' + TgNews.channel();
  const ask = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* full or blocked */ } };

  /* "0.12" > "0.10" > "0.9", compared part by part as numbers */
  function newer(a, b) {
    const x = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const y = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] || 0, q = y[i] || 0;
      if (p !== q) return p > q;
    }
    return false;
  }
  TgNews.newer = newer;

  function decode(s) {
    return String(s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d));
  }

  /* every post on the channel's public page: { text, hrefs } — oldest first, as Telegram writes the page */
  function posts(html) {
    const out = [];
    const re = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(html))) {
      const chunk = m[1], hrefs = [];
      const hr = /href="([^"]+)"/g;
      let a;
      while ((a = hr.exec(chunk))) {
        let u = a[1];
        if (u.slice(0, 2) === '//') u = 'https:' + u;
        if (/^https?:\/\//i.test(u) && hrefs.indexOf(u) < 0) hrefs.push(u);
      }
      out.push({ text: decode(chunk), hrefs: hrefs });
    }
    return out;                                          // the page lists them oldest first
  }
  TgNews.posts = posts;

  /* one post → { version, note, link, lines } or null.
     The rule the owner asked for: the caption's words do not matter — the APP'S NAME and a
     VERSION NUMBER do.  "RongTuli 1.1", "🔥 RongTuli আপডেট 1.1 এসেছে!", "RongTuli-1.1.apk",
     "Rong Tuli v1.1" — all read as 1.1.  A post with no name, or a name with no number, is not news. */
  const APKNAME = /[\w-]*rong[\w-]*?[v ]?(\d{1,3}(?:\.\d{1,3}){1,2})[\w-]*\.apk/i;
  function bengaliDigits(s) {                                // ১.১ → 1.1
    return String(s).replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09E6));
  }
  function read(post) {
    const text = bengaliDigits(typeof post === 'string' ? post : String((post && post.text) || ''));
    const hrefs = (post && post.hrefs) || [];
    const low = text.toLowerCase();
    /* where does the app's name appear?  (the earliest one wins) */
    let at = -1, len = 0;
    for (const n of TgNews.names) {
      const i = low.indexOf(n.toLowerCase());
      if (i >= 0 && (at < 0 || i < at)) { at = i; len = n.length; }
    }
    if (at < 0) return null;                                 // no app name: not our news
    /* a version number near the name (right after it, a few words of caption allowed) */
    let version = '';
    const tail = text.slice(at + len, at + len + 44);
    const vm = tail.match(/[vV]?\s?(\d{1,3}(?:\.\d{1,3}){0,2})\b/);
    if (vm && !/\d/.test(tail.slice(0, vm.index))) version = vm[1];
    if (!version) { const f = text.match(APKNAME); if (f) version = f[1]; }   // the file's own number
    if (!version) return null;                               // name but no number: not news
    /* the note: the line under the name line, and the short lines after it (nothing that is a link) */
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const nameLine = lines.findIndex((l) => new RegExp(TgNews.names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i').test(l));
    const rest = lines.slice(Math.max(0, nameLine + 1)).filter((l) => !/^https?:\/\//i.test(l));
    let note = rest.length ? rest[0].replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 120) : '';
    if (/^force$/i.test(note)) note = '';
    /* the download: a link in the post, else the link behind a word, else the channel itself */
    let link = '';
    const u = text.match(/https?:\/\/\S+/);
    if (u) link = u[0];
    if (!link) link = hrefs.find((x) => !/^https?:\/\/(t\.me|telegram\.me)\/[^/]+\/?$/i.test(x)) || '';
    /* the post itself (its own address in the channel), so Download Now can open this post */
    return { version: version, note: note, link: link, lines: rest.slice(0, 4), tgLink: (post && post.link) || '',
             force: /(^|\n)\s*force\s*($|\n)/i.test(text) };
  }
  TgNews.read = read;

  /* the channel's page as text.  Inside the Android app a plain fetch is refused by the WebView (CORS),
     so there the page is read by the app's own Java half (RTAndroid.fetchChannel → rtTgText). */
  let waiting = null;
  window.rtTgText = function (ok, text) {
    if (waiting) { const w = waiting; waiting = null; w(ok && text ? String(text) : null); }
  };
  function pageText() {
    const url = TgNews.url() + '?t=' + Math.floor(Date.now() / 60000);
    if (window.RTAndroid && window.RTAndroid.fetchChannel) {
      return new Promise((done) => {
        waiting = done;
        try { window.RTAndroid.fetchChannel(url); } catch (e) { waiting = null; done(null); }
        setTimeout(() => { if (waiting === done) { waiting = null; done(null); } }, 15000);
      });
    }
    /* a plain page can only read it when it is served over http(s) — and Telegram sends no CORS header,
       so in practice the channel is read by the Android app's own half. A page opened from the phone's
       storage (file://) cannot read it at all: quiet about that, latest.json does the job there. */
    if (!/^https?:$/.test(location.protocol) || (U.sandboxed && U.sandboxed())) return Promise.resolve(null);
    return fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  }

  /* find the newest known version in the channel (quiet about every kind of trouble) */
  TgNews.fetch = async function () {
    const html = await pageText();
    if (!html) return null;
    const all = posts(html).reverse();                    // newest first
    for (const p of all) {
      const got = read(p);
      if (got && got.version) return got;
    }
    return null;
  };

  /* at start (and at most once a day): is there something newer? */
  /* the owner can turn the blocking card off for a while (Settings → "Check for updates" uses it) */
  const OFF = 'rt-intro-off';                              // set by the tests: no cards at all
  TgNews.check = async function (force) {
    const last = +(ask(KEY) || 0);
    if (!force && Date.now() - last < SOON) return TgNews.found || null;
    keep(KEY, String(Date.now()));
    try {
      const got = await TgNews.fetch();
      if (!got || !newer(got.version, APP_VERSION)) { TgNews.found = null; return null; }
      if (!TgNews.configured() || /your_channel/i.test(TgNews.channel())) return null;
      got.tgLink = got.tgLink || got.link || null;          // the post the version was read from
      got.link = got.link || ('https://t.me/' + TgNews.channel());
      got.channel = TgNews.channel();
      got.fromChannel = true;
      TgNews.found = got;
      /* the blocking card — the only way on is Download Now */
      try {
        const testPage = /[?&]test=1\b/.test(location.search);
        if (typeof Forced !== 'undefined' && ask(OFF) !== '1' && !testPage) Forced.show(got);
      } catch (e) { /* the app still works */ }
      return got;
    } catch (e) {
      return null;                                       // offline, or Telegram did not answer: no trouble
    }
  };

  /* is the channel really set up? (a phone with no channel yet must not be told about an update) */
  TgNews.configured = () => /^[A-Za-z0-9_]{4,}$/.test(TgNews.channel()) && TgNews.channel().toLowerCase() !== 'your_channel';

  TgNews.start = function () {
    /* after the welcome card has had its moment */
    setTimeout(() => { TgNews.check(false); }, (typeof Welcome !== 'undefined' && Welcome.wanted()) ? 4200 : 2400);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) TgNews.check(false);
  });
  TgNews.seen = () => ask(SEEN);
  TgNews.saw = (v) => keep(SEEN, v);
})();
