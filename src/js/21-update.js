'use strict';
/* ============================================================
 * 21-update.js : the update alert.
 *
 * The app asks ONE small file for the newest version, at start and at most once a day:
 *     latest.json      (written by the owner; see docs/update.md)
 * It holds { version, link, note, force, min }. If its version is newer than this app's
 * (APP_VERSION), a sheet says "Update" — and its buttons open the owner's link
 * (a Telegram channel, a web page, Google Drive …) where the new APK is.
 *
 * No server is needed for this: the file can be an ordinary web address (GitHub Gist,
 * Pastebin, a page on any hosting) or a Telegram channel post… it is only text.
 * Nothing runs until the file says a newer version; nothing of the user is sent anywhere.
 * "Later" is remembered for that version, so the sheet is not pushed in the face every time.
 * ============================================================ */
const Updater = {};
(function () {
  const h = U.h;
  /* ---- the owner changes these ---- */
  /* where latest.json lives.  Two copies of the same file are asked in turn: GitHub's mirror
     (cdn.jsdelivr.net) answers at once with the newest text, the plain raw address is the fallback. */
  Updater.INFO_URLS = [
    'https://raw.githubusercontent.com/musatalukder220-stack/rongtuli/main/latest.json',   // the file itself (a few minutes behind at most)
    'https://cdn.jsdelivr.net/gh/musatalukder220-stack/rongtuli@main/latest.json'          // a mirror, in case GitHub's host is blocked
  ];
  Updater.INFO_URL = Updater.INFO_URLS[0];
  Updater.CHANNEL = 'https://t.me/rongtuli_app';
  /* the direct address of an app file, made from its version (Download Now opens it and the phone
     starts the download; latest.json's own "link" is used when that is already an .apk address) */
  const APK_BASE = 'https://github.com/musatalukder220-stack/rongtuli/releases/latest/download/RongTuli-';
  function apkFor(version) { return version ? APK_BASE + encodeURIComponent(version) + '.apk' : ''; }
  Updater.NEWS = true;                                                                     // also read the Telegram channel (22-tg.js)                                                       // shown when latest.json has no link
  /* ---- nothing to change below ---- */
  const CHECK_KEY = 'rt-update-check', SEEN_KEY = 'rt-update-seen';
  const DAY = 24 * 60 * 60 * 1000;
  let found = null;            // the newer version, once known
  let checked = 0;

  function ask(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function keep(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* full or blocked: it simply asks again */ } }

  /* "0.10" > "0.9": compare part by part as numbers */
  function newer(a, b) {
    const x = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const y = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] || 0, q = y[i] || 0;
      if (p !== q) return p > q;
    }
    return false;
  }
  Updater.newer = newer;

  /* read latest.json; quiet about every kind of trouble (no internet, a bad file, no permission) */
  Updater.check = async function (force) {
    if (!/^https?:/.test(Updater.INFO_URL) || /OWNER\/GISTID/.test(Updater.INFO_URL)) return null;   // not set up yet
    const last = +(ask(CHECK_KEY) || 0);
    if (!force && Date.now() - last < DAY) return found;
    keep(CHECK_KEY, String(Date.now()));
    checked = Date.now();
    try {
      let j = null;
      for (const url of (Updater.INFO_URLS && Updater.INFO_URLS.length ? Updater.INFO_URLS : [Updater.INFO_URL])) {
        try {
          const r = await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000), { cache: 'no-store' });
          if (!r.ok) continue;
          const got = await r.json();
          if (got && got.version) { j = got; break; }
        } catch (e) { /* try the next address */ }
      }
      if (!j || !j.version) return found;
      if (!newer(j.version, APP_VERSION)) { found = null; return null; }
      found = {
        version: String(j.version),
        link: typeof j.link === 'string' && /^https?:\/\//.test(j.link) ? j.link : Updater.CHANNEL,
        note: typeof j.note === 'string' ? j.note : '',
        force: j.force === true,
        min: j.min ? String(j.min) : ''
      };
      return found;
    } catch (e) {
      return found;            // offline is not an error: the app works
    }
  };

  /* A newer version was found: the owner's blocking card (25-forced style, one button: Download Now).
     There is no second sheet any more — the old "Update / Later" sheet is exactly what the owner
     did not want.  Everything goes through Forced.show(). */
  let shownFor = '';                                        // which version's card is already on the screen
  /* where Download Now goes: the update post in the owner's Telegram channel (that is what the owner
     wants a phone to open — never the GitHub page).  The APK link is only a last resort, for a phone
     where the channel is not known at all. */
  /* the owner, 1.5: for now Download Now starts the download itself (the direct APK link) — the
     Telegram channel comes back later, once that way of reading the channel works properly. */
  function updaterLink(u) {
    /* only the number, never the caption it came with */
    const v = (String((u && u.version) || '').match(/\d{1,3}(?:\.\d{1,3}){0,2}/) || [''])[0];
    const link = String((u && u.link) || '');
    /* an .apk address that is really this version (the owner may host it anywhere) */
    if (/^https?:\/\//i.test(link) && /\.apk(\?|#|$)/i.test(link) && (!v || link.indexOf(v) >= 0)) return link;
    const direct = apkFor(v);
    if (direct) return direct;
    if (/^https?:\/\//i.test(link) && !/^https?:\/\/github\.com\/[^/]+\/[^/]+\/releases/i.test(link)) return link;
    return Updater.CHANNEL;
  }
  Updater.linkFor = updaterLink;
  Updater.open = function (info) {
    const u = info || found;
    if (!u) { U.toast('You have the newest version (' + APP_VERSION + ')'); return; }
    if (typeof Forced === 'undefined') return;               // (the card's own file is missing: stay quiet)
    if (Forced.isOpen() && shownFor === u.version) return;   // already showing: never stack two cards
    shownFor = u.version;
    /* the small lines are the owner's own words, in the language the channel is written in;
       when there are none the card shows short English lines (never a machine translation) */
    const lines = (u.lines || []).filter((x) => x && !/^https?:/i.test(x));
    /* `note` is the owner's one-line news ("./latest.json" -> {"note": "Gradient text, round logo"}) */
    Forced.show({ version: u.version, note: String(u.note || '').slice(0, 120), link: updaterLink(u), channel: Updater.CHANNEL,
                  lines: lines, english: !lines.length });
  };

  /* at start (and after a long pause in the background): look, and speak only when there is something newer */
  Updater.start = async function () {
    const u = await Updater.check(false);
    if (!u) return;
    Updater.open(u);            // every open, until the app is updated (the owner's rule for 1.6)
  };
  /* the Android half asks latest.json itself and calls this when it is newer */
  window.rtUpdate = function (version, note, force, link) {
    if (!version || !newer(version, APP_VERSION)) return;
    found = { version: String(version), note: String(note || ''), force: force === true, link: /^https?:\/\//.test(String(link || '')) ? String(link) : Updater.CHANNEL, min: '' };
    /* the owner's rule (1.6): a new version is announced on EVERY open, not only the first time
       (only "force" is remembered differently — it simply keeps the card up) */
    Updater.open(found);
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - checked > 6 * 60 * 60 * 1000) Updater.start();
  });
})();
