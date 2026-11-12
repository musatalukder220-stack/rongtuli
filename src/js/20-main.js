'use strict';
/* 20-main.js : start the app */
(function () {
  function boot() {
    UI.init();
    Folders.init();
    // fonts arrive a moment later; redraw any text once they are ready
    U.on('fonts', () => { for (const l of Doc.layers) if (l.type === 'text') Layers.touch(l); View.request(); });
    Fonts.init().then(() => Fonts.restore()).catch((e) => console.error(e));   // built-in fonts, then the ones the user brought in
    window.RT = { Updater: typeof Updater !== 'undefined' ? Updater : null, U: U, Doc: Doc, View: View, History: History, UI: UI, Layers: Layers, Fonts: Fonts, FX: FX, IP: IP, TextRender: TextRender, Zip: Zip, PLP: PLP, Project: Project, Store: Store, Folders: Folders, Exporter: Exporter, AICut: AICut, TgNews: typeof TgNews !== 'undefined' ? TgNews : null, HomeBar: typeof HomeBar !== 'undefined' ? HomeBar : null, Forced: typeof Forced !== 'undefined' ? Forced : null, Welcome: typeof Welcome !== 'undefined' ? Welcome : null };
    AICut.check();      // is the AI add-on next to the page? (Remove BG asks AICut.ready())
    /* first open / new install: the welcome card, and then the update news */
    if (typeof Welcome !== 'undefined') {
      Welcome.start(() => {
        setTimeout(() => { if (window.Updater) Updater.start(); }, 1200);
        if (typeof TgNews !== 'undefined') TgNews.start();
      });
    } else {
      setTimeout(() => { if (window.Updater) Updater.start(); }, 2500);
      if (typeof TgNews !== 'undefined') TgNews.start();
    }
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) UI.openCanvas(UI.demoCanvas());
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !U.sandboxed() && !window.RTAndroid) {      // the Android app carries its files itself
      navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
    }
  }
  window.addEventListener('error', (e) => { console.error(e.error || e.message); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
