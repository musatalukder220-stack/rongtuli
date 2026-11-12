'use strict';
/* ============================================================
 * 24-forced.js : the "new version" card — shown until the user downloads.
 *
 * It is built from the owner's screenshot (the PicsArt-style card):
 *
 *   ╔═══════════════════════════════════════════════════╗
 *   ║  [logo]  ✨  A new version of RongTuli is here!   ║   <- heading, English
 *   ║            Version 1.1 — faster Remove            ║   <- the version that is posted
 *   ║                                                   ║
 *   ║  🔥 New in this release: …                        ║
 *   ║     • … • … • …                                   ║
 *   ║  [           Download Now           ]  (violet→blue)
 *   ║  t.me/rongtuli_app                                ║   <- small, under the button
 *   ╚═══════════════════════════════════════════════════╝
 *
 * There is NO close button and NO way back into the app: the only way on is Download Now,
 * which opens the owner's link (the Telegram post).  The phone's Back button leaves the app
 * (two presses: the card is the second screen), the home button leaves it at once.
 * The card is drawn over the home page and the editor, above every sheet and tool.
 * ============================================================ */
const Forced = {};
(function () {
  const h = U.h;
  let box = null, info = null, pushed = 0;

  Forced.isOpen = () => !!box && !!box.parentNode;

  function openLink(link) {
    try {
      if (window.RTAndroid && window.RTAndroid.openUrl) { window.RTAndroid.openUrl(link); return; }
    } catch (e) { /* fall through to the browser */ }
    location.href = link;
  }

  /* the small lines under the heading come from the owner's post; a plain one is used if there are none */
  function bullets() {
    const note = String(info.note || '').trim().toLowerCase();
    const told = (info.lines || []).filter((s) => s && !/^https?:/i.test(s) && !/^force$/i.test(s)
      && s.trim().toLowerCase() !== note);
    if (told.length) return told.slice(0, 3);
    return ['Faster and smoother tools', 'Small fixes all over', 'Your pictures and projects stay'];
  }

  function build() {
    const img = h('div', { class: 'ver-logo', html: I.logo(64) });
    const list = h('div', { class: 'ver-list' }, bullets().map((t) => h('div', { class: 'ver-li', text: t })));
    const go = h('button', { class: 'ver-go', type: 'button', id: 'ver-go', text: 'Download Now' });
    U.onTap(go, () => openLink(info.link));
    box = h('div', { class: 'verwrap', id: 'verwrap' },
      h('div', { class: 'vercard', role: 'alertdialog', 'aria-label': 'New version' },
        h('div', { class: 'ver-hero' }, img,
          h('div', { class: 'ver-hero-txt' },
            h('div', { class: 'ver-spark', text: '✨' }),
            h('div', { class: 'ver-big', text: 'A new version of ' + APP_NAME + ' is here!' }),
            h('div', { class: 'ver-v', text: 'Version ' + info.version + (info.note ? ' — ' + info.note : '') }))),
        h('div', { class: 'ver-body' },
          h('div', { class: 'ver-b', text: "🔥 What's new" }),
          list,
          go,
          h('div', { class: 'ver-tag', text: '@' + info.channel }))));
  }

  /* a small helper: is this running inside the Android app? */
  function native(method, arg) {
    try { if (window.RTAndroid && window.RTAndroid[method]) { window.RTAndroid[method](arg); return true; } } catch (e) { /* not the app */ }
    return false;
  }

  Forced.show = function (o) {
    if (!o || !o.version) return;
    info = { version: String(o.version), note: String(o.note || ''), link: String(o.link || ''), channel: String(o.channel || 'rongtuli_app'), lines: o.lines || [] };
    if (!/^https?:\/\//i.test(info.link)) info.link = 'https://t.me/' + info.channel;
    if (Forced.isOpen()) return;
    build();
    document.body.appendChild(box);
    document.body.classList.add('locked');
    if (typeof UI !== 'undefined') { try { UI.locked = true; UI.setPanel(null); } catch (e) { /* nothing open */ } }
    native('setLock', true);                               // (Android: Back is handed to this card)
    /* Back: the first press only says "press again to exit" (the card must not go away),
       the second press leaves the app.  Nothing ever opens the app behind the card. */
    Forced._backTold = 0;
    try { history.pushState({ ver: 1 }, ''); } catch (e) { /* the browser may refuse */ }
    /* Android's Back button arrives here (see MainActivity.onBackPressed) */
    window.rtBack = () => Forced.back();
    Forced._onPop = () => Forced.back();
    window.addEventListener('popstate', Forced._onPop);
  };

  /* one Back press: nothing but a hint (the card must stay); the second press leaves the app */
  Forced.back = function () {
    const now = Date.now();
    if (now - Forced._backTold > 2500) {
      Forced._backTold = now;
      U.toast('Press Back again to exit', 2000);
      try { history.pushState({ ver: 1 }, ''); } catch (e) { /* nothing to hold */ }
      return;
    }
    Forced._backTold = 0;
    try { if (window.RTAndroid && window.RTAndroid.quit) { window.RTAndroid.quit(); return; } } catch (e) { /* older app */ }
    try { history.back(); } catch (e) { /* nothing more */ }
  };

  Forced.hide = function () {
    if (!Forced.isOpen()) return;
    window.removeEventListener('popstate', Forced._onPop);
    box.remove(); box = null;
    native('setLock', false);
    document.body.classList.remove('locked');
    if (typeof UI !== 'undefined') UI.locked = false;
  };
})();
