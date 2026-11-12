'use strict';
/* ============================================================
 * 25-welcome.js : the first-open card ("Welcome to <app>") — the owner's screenshot.
 *
 *   ╔══════════════════════════════════════════════════╗
 *   ║   [logo]        ╭───────────╮                    ║
 *   ║                 │  Welcome  │                    ║
 *   ║                 ╰───────────╯  @rongtuli_app     ║
 *   ║                                                  ║
 *   ║   Thanks for choosing RongTuli! Join my official ║
 *   ║   Telegram channel for more features and updates.║
 *   ║                                                  ║
 *   ║   ( •)  Don't show this again                    ║
 *   ║   [   CLOSE   ]        [   JOIN NOW   ]          ║
 *   ╚══════════════════════════════════════════════════╝
 *
 * It comes once when the app is opened for the first time and once more after every new
 * install (the app remembers the version it last said hello for).  "Don't show this again"
 * is remembered for good.  It does not block anything: CLOSE simply puts it away.
 * ============================================================ */
const Welcome = {};
(function () {
  const h = U.h;
  const KEY_VER = 'rt-hello-ver', KEY_OFF = 'rt-hello-off';
  const CHANNEL = 'rongtuli_app';
  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: it simply shows again */ } };

  Welcome.channel = () => (typeof TgNews !== 'undefined' && TgNews.channel ? TgNews.channel() : CHANNEL);

  Welcome.wanted = function () {
    if (/[?&]test=1\b/.test(location.search)) return false;    // a test page (the cards would cover it)
    if (get(KEY_OFF) === '1') return false;              // "Don't show this again" was ticked
    return get(KEY_VER) !== APP_VERSION;                 // first open, or a new install
  };

  function joinLink() {
    return 'https://t.me/' + Welcome.channel();
  }
  function openLink(url) {
    try { if (window.RTAndroid && window.RTAndroid.openUrl) { window.RTAndroid.openUrl(url); return; } } catch (e) { /* browser */ }
    location.href = url;
  }

  Welcome.show = function (after) {
    const tick = h('input', { type: 'checkbox', id: 'wel-never' });
    const close = h('button', { class: 'wel-close', type: 'button', id: 'wel-close', text: 'CLOSE' });
    const join = h('button', { class: 'wel-join', type: 'button', id: 'wel-join', text: 'JOIN NOW' });
    const card = h('div', { class: 'welcard', role: 'dialog', 'aria-label': 'Welcome' },
      h('div', { class: 'wel-hero' },
        h('div', { class: 'wel-logo', html: I.logo(58) }),
        h('div', { class: 'wel-mid' },
          h('div', { class: 'wel-pill', text: 'Welcome' }),
          h('div', { class: 'wel-handle', text: '@' + Welcome.channel() }))),
      h('div', { class: 'wel-body' },
        h('div', { class: 'wel-thanks', text: 'Thanks for choosing ' + APP_NAME + '!' }),
        h('div', { class: 'wel-text', text: 'Join my official Telegram channel for more features, new frames and updates.' }),
        h('label', { class: 'wel-never' }, tick, h('span', { text: "Don't show this again" })),
        h('div', { class: 'wel-row' }, close, join)));
    const bg = h('div', { class: 'welbg', id: 'welbg' }, card);
    document.body.appendChild(bg);

    const done = () => {
      if (tick.checked) set(KEY_OFF, '1');
      set(KEY_VER, APP_VERSION);                          // (also for CLOSE: the card comes back after the next install)
      bg.remove();
      if (after) after();
    };
    U.onTap(close, done);
    U.onTap(join, () => { openLink(joinLink()); done(); });
    return bg;
  };

  /* at start: the welcome card first (if it is due), then whatever comes after it */
  Welcome.start = function (after) {
    setTimeout(() => {
      if (Welcome.wanted()) Welcome.show(after);
      else if (after) after();
    }, 700);
  };
})();
