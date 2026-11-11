'use strict';
/* ============================================================
 * 23-homebar.js : the "new version" strip on the home page.
 *
 * The home page is the first thing a user sees, so this is where an update must show up —
 * not only in a sheet that appears once. When 22-tg.js (or the Android half) has seen a newer
 * version, a strip sits under the logo:
 *
 *     ⬆  New version 0.12   Better Remove, new frames        [ Update ]   ×
 *
 * [ Update ] opens the same sheet as before (with the download link and the three install
 * steps). The × hides the strip for that version only — the next version shows it again.
 * ============================================================ */
const HomeBar = {};
(function () {
  let cur = null;                                  // the newer version, once known
  const el = (t, a, ...kids) => U.h(t, a, ...kids);        // (U.h takes the children as further arguments)
  const hidden = (v) => { try { return localStorage.getItem('rt-strip-hide') === String(v); } catch (e) { return false; } };
  const hide = (v) => { try { localStorage.setItem('rt-strip-hide', String(v)); } catch (e) { /* nothing */ } };

  HomeBar.show = function (info) {
    if (!info || !info.version) return;
    cur = info;
    const slot = U.$('#draft-slot');
    if (!slot) return;
    const old = U.$('#newver'); if (old) old.remove();
    if (hidden(info.version)) return;
    const btn = el('button', { class: 'nv-btn', type: 'button', id: 'nv-go', text: 'Update' });
    const x = el('button', { class: 'nv-x', type: 'button', id: 'nv-x', 'aria-label': 'Hide', text: '×' });
    const box = el('div', { class: 'newver', id: 'newver' },
      el('div', { class: 'nv-in' },
        el('div', { class: 'nv-txt' },
          el('b', { text: 'New version ' + info.version }),
          info.note ? el('span', { text: info.note }) : null),
        btn, x));
    U.onTap(btn, () => { if (cur) (typeof Updater !== 'undefined' ? Updater.open(cur) : null); });
    U.onTap(x, () => { hide(info.version); box.remove(); });
    slot.appendChild(box);
  };
  /* the sheet is closed with "Later": keep the strip (it is small), only the sheet stays away */
  HomeBar.refresh = function () { if (cur) HomeBar.show(cur); };
})();
