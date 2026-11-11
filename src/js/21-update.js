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
  Updater.INFO_URL = 'https://raw.githubusercontent.com/musatalukder220-stack/rongtuli/main/latest.json';   // where latest.json lives
  Updater.CHANNEL = 'https://t.me/rongtuli_app';
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
      const r = await fetch(Updater.INFO_URL + (Updater.INFO_URL.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000));
      if (!r.ok) return found;
      const j = await r.json();
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

  /* the sheet itself */
  let openFor = '';                                          // which version's sheet is already on the screen
  Updater.open = function (info) {
    const u = info || found;
    if (!u) { U.toast('You have the newest version (' + APP_VERSION + ')'); return; }
    if (openFor === u.version && U.$('#up-go')) return;       // already showing: do not stack two sheets
    let w = null;
    if (/^https?:\/\/t\.me\//.test(u.link)) {
      // a Telegram channel: the app stays whole; the page carries a link to it
      w = new URLSearchParams({ v: u.version, f: '1' });
      if (u.note) w.set('n', u.note);
      if (u.link) w.set('u', u.link);                    // (the download: MediaFire, Drive, Telegram … whatever the owner posted)
    }
    const go = h('button', { class: 'btn pri', type: 'button', id: 'up-go', text: 'Update' });
    U.onTap(go, () => {
      if (w) { sh.close(); location.href = 'update.html?' + w.toString(); return; }
      try { Native.openUrl(u.link); } catch (e) { location.href = u.link; }
      sh.close();
    });
    const later = h('button', { class: 'btn', type: 'button', id: 'up-later', text: 'Later' });
    U.onTap(later, () => { keep(SEEN_KEY, u.version); sh.close(); openFor = ''; });
    const rows = [
      h('p', { class: 'up-h', text: 'A new version is ready' }),
      h('p', { class: 'up-v', text: 'You have ' + APP_VERSION + ' · new is ' + u.version }),
      u.note ? h('p', { class: 'up-note', text: u.note }) : null,
      h('p', { class: 'panel-note', text: 'Tap Update, then download the new app from the link and install it over this one. Your pictures and projects stay.' }),
      h('div', { class: 'row-c' }, go),
      h('div', { class: 'row-c' }, later),
      h('p', { class: 'panel-note dim', text: 'Your work is not touched by an update.' })
    ].filter(Boolean);
    const sh = UI.sheet('Update', h('div', { class: 'panel-pad up' }, rows));
    openFor = u.version;
    return sh;
  };

  /* at start (and after a long pause in the background): look, and speak only when there is something newer */
  Updater.start = async function () {
    const u = await Updater.check(false);
    if (!u) return;
    if (ask(SEEN_KEY) === u.version && !u.force) return;        // said once for this version; "Later" was chosen
    Updater.open(u);
  };
  /* the Android half asks latest.json itself and calls this when it is newer */
  window.rtUpdate = function (version, note, force, link) {
    if (!version || !newer(version, APP_VERSION)) return;
    found = { version: String(version), note: String(note || ''), force: force === true, link: /^https?:\/\//.test(String(link || '')) ? String(link) : Updater.CHANNEL, min: '' };
    if (ask(SEEN_KEY) === found.version && !found.force) return;
    Updater.open(found);
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - checked > 6 * 60 * 60 * 1000) Updater.start();
  });
})();
