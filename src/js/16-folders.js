'use strict';
/* ============================================================
 * 16-folders.js : "My folders" — projects saved on this phone.
 *   - Save project (name + folder), after that every change is saved by itself
 *   - the My folders page: folders, project cards, rename / move / copy / delete / download / share
 *   - a safety copy of an unsaved edit, so work survives when the phone closes the browser
 * ============================================================ */
const Folders = {};
(function () {
  const h = U.h;
  let rev = 0;               // goes up with every finished change (and when a document is opened)
  let savedRev = -1;         // rev at the last save of the open project
  let draftRev = -1;         // rev at the last safety copy of an unsaved document
  let failedRev = -1;        // rev at which saving by itself last failed (no retry until something changes)
  let restored = -1;         // Doc.serial of a document that was brought back from the safety copy
  let draftOf = -1;          // Doc.serial of the document the stored safety copy was written for (in this visit)
  let timer = null, lastSaved = 0, lastFolder = '';
  let chain = Promise.resolve();
  let page = null;           // the open My folders page

  /* one save at a time */
  function serial(fn) {
    const p = chain.then(fn);
    chain = p.catch(() => { });
    return p;
  }
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB');
  function when(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date(), min = Math.round((now - d) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    const p = (n) => String(n).padStart(2, '0'), time = p(d.getHours()) + ':' + p(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return 'today ' + time;
    const y = new Date(now.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) return 'yesterday ' + time;
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + M[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
  }
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  /* why nothing is kept here, and what to do about it */
  const noKeep = () => (U.sandboxed()
    ? 'This preview window cannot keep files: projects saved here are forgotten when it is closed. Open the app in its own tab to keep them on the phone.'
    : 'This browser does not let the app keep files (private mode?): projects saved here are forgotten when the page is closed. Download the project file to keep your work.');

  /* is there work in the open document that is in no project yet? */
  function unsaved() { return Doc.open && !Doc.pid && (History.dirty() || restored === Doc.serial); }
  Folders.unsaved = unsaved;
  /* would closing the page right now lose something? */
  Folders.pending = function () {
    if (!Doc.open) return false;
    if (Doc.pid) return rev !== savedRev;
    return unsaved() && !(Store.persistent && draftRev === rev);
  };

  /* ---------- writing ---------- */
  async function write(o) {
    o = o || {};
    const pid = Doc.pid, myRev = rev, doc = Doc.serial, name = Doc.name;
    const pk = await Project.pack({ name: name, progress: o.progress });
    const buf = await pk.blob.arrayBuffer();
    const now = Date.now();
    const info = { modified: now, width: pk.width, height: pk.height, count: pk.count, size: buf.byteLength, thumb: pk.thumb };
    if (pid) {
      const old = await Store.meta(pid);
      const meta = Object.assign({ id: pid, kind: 'project', folder: o.folder || '', created: now }, old || {}, info, { name: name || (old && old.name) || 'Untitled' });
      await Store.save(meta, buf);
      if (Doc.open && Doc.pid === pid && Doc.serial === doc) { savedRev = myRev; lastSaved = now; }
    } else {
      if (draftOf !== doc && restored !== doc) await rescueDraft();
      await Store.save(Object.assign({ id: 'draft', kind: 'draft', name: name || '' }, info), buf);
      draftOf = doc;
      if (Doc.serial === doc) draftRev = myRev;
    }
  }
  /* There is room for one safety copy. Before the copy of another edit takes its place, an older one that was
     never opened again is moved into My folders, so it is not lost. */
  async function rescueDraft() {
    const old = await Store.meta('draft');
    if (!old) return;
    const buf = await Store.load('draft');
    if (buf) {
      const d = new Date(old.modified || Date.now()), p2 = (n) => String(n).padStart(2, '0');
      const name = tidy((old.name || 'Unsaved edit') + ' ' + d.getDate() + '-' + (d.getMonth() + 1) + ' ' + p2(d.getHours()) + '.' + p2(d.getMinutes())).slice(0, 60);
      await Store.save(Object.assign({}, old, { id: Store.newId('p'), kind: 'project', folder: '', name: name, created: old.modified || Date.now() }), buf);
    }
    await Store.remove('draft');
  }
  /* save what changed, quietly (no spinner). Safe to call any time. */
  Folders.flush = function () {
    clearTimeout(timer); timer = null;
    if (!Doc.open) return Promise.resolve();
    return serial(async () => {
      if (!Doc.open) return;
      if (Doc.pid) { if (rev === savedRev) return; }
      else if (!unsaved() || draftRev === rev || !Store.persistent) return;
      await write();
    });
  };
  function autoFail(e) {
    console.warn('autosave:', e && e.message ? e.message : e);
    if (failedRev === rev) return;
    failedRev = rev;
    if (Doc.open && Doc.pid) U.toast('Saving by itself did not work: ' + (e && e.message ? e.message : 'storage problem'), 4200);
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (!Doc.open) return;
    const tick = function () {
      timer = null;
      if (!Doc.open) return;
      if (UI.mode()) { timer = setTimeout(tick, 2500); return; }      // a tool is open: wait until it is applied or closed
      Folders.flush().catch(autoFail);
    };
    timer = setTimeout(tick, 3500);
  }
  /* before the editor closes: make sure the open project is saved (shows a spinner only when there is work). Throws when it cannot. */
  Folders.finish = async function () {
    clearTimeout(timer); timer = null;
    if (!Doc.open || !Doc.pid) return;
    await chain;
    if (rev === savedRev) return;
    await U.busy(() => serial(() => write()), 'Saving…');
  };
  /* the unsaved work of the open document is settled (saved as a project, or thrown away): its safety copy can go.
     A safety copy that belongs to some other edit stays where it is. */
  Folders.forget = function () {
    clearTimeout(timer); timer = null;
    const mine = Doc.open && (draftOf === Doc.serial || restored === Doc.serial);
    draftRev = -1; restored = -1;
    if (!mine) return Promise.resolve();
    draftOf = -1;
    return serial(() => Store.remove('draft')).catch(() => { });
  };

  /* ---------- Save project ---------- */
  /* give the open document a place in My folders. -> true when saved */
  Folders.saveAs = async function (name, folder) {
    if (!Doc.open) return false;
    const before = { pid: Doc.pid, name: Doc.name };
    clearTimeout(timer); timer = null;
    try {
      await U.busy(async () => {
        await chain;
        Doc.pid = Store.newId('p'); Doc.name = tidy(name) || 'Untitled';
        await serial(() => write({ folder: folder || '', progress: (a, b) => U.busyLabel('Saving… ' + a + ' / ' + b) }));
      }, 'Saving…');
    } catch (e) {
      Doc.pid = before.pid; Doc.name = before.name;
      console.error(e);
      U.toast(e && e.message ? e.message : 'The project could not be saved', 4200);
      return false;
    }
    lastFolder = folder || '';
    Folders.forget(); Store.keep();
    U.toast(Store.persistent ? 'Saved to My folders. From now on every change is saved by itself.' : 'Saved for now — it is forgotten when this ' + (U.sandboxed() ? 'preview window' : 'page') + ' is closed.', 3400);
    return true;
  };

  async function newFolder(existing) {
    const name = await UI.prompt('New folder', '', { placeholder: 'Folder name', ok: 'Create', max: 30 });
    if (!name) return null;
    const dup = (existing || []).find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (dup) { U.toast('That folder is already there'); return dup; }
    const f = { id: Store.newId('f'), kind: 'folder', name: name, created: Date.now() };
    try { await Store.save(f); } catch (e) { U.toast(e.message || 'Could not make the folder', 3200); return null; }
    return f;
  }
  /* a row of folders to choose from; onPick(id) */
  function folderPicker(folders, current, onPick) {
    const box = h('div', { class: 'fd-pick' });
    let cur = current || '';
    const draw = () => {
      U.clear(box);
      const chip = (id, label, extra) => {
        const b = h('button', { class: 'chip' + (extra || '') + (id === cur ? ' on' : ''), type: 'button', 'data-f': id }, h('span', { text: label }));
        box.appendChild(b);
        return b;
      };
      U.onTap(chip('', 'No folder'), () => { cur = ''; draw(); onPick(cur); });
      for (const f of folders) U.onTap(chip(f.id, f.name), () => { cur = f.id; draw(); onPick(cur); });
      U.onTap(chip('+', '+ New folder', ' ghost'), async () => {
        const f = await newFolder(folders);
        if (!f) return;
        if (!folders.some((q) => q.id === f.id)) { folders.push(f); folders.sort((a, b) => a.name.localeCompare(b.name)); }
        cur = f.id; draw(); onPick(cur);
      });
    };
    draw();
    return box;
  }
  /* ask for a name and a folder, then save. -> true when saved */
  Folders.saveDialog = async function () {
    if (!Doc.open) return false;
    if (Doc.pid) { try { await Folders.finish(); return true; } catch (e) { U.toast(e.message || 'Could not save', 3600); return false; } }
    let all;
    try { all = await Store.all(); } catch (e) { U.toast(e.message || 'The storage did not open', 3600); return false; }
    return new Promise((resolve) => {
      let folder = all.folders.some((f) => f.id === lastFolder) ? lastFolder : '';
      const inp = h('input', { type: 'text', class: 'inp', id: 'pj-name', maxlength: 60, value: Doc.name || 'Project ' + (all.projects.length + 1), 'aria-label': 'Project name', autocomplete: 'off', enterkeyhint: 'done' });
      const ok = h('button', { class: 'btn pri', type: 'button', text: 'Save', id: 'btn-pj-save' });
      const no = h('button', { class: 'btn', type: 'button', text: 'Cancel' });
      const bd = h('div', { class: 'backdrop center top' }, h('div', { class: 'dialog' },
        h('h3', { text: 'Save project' }),
        h('div', { class: 'lbl', text: 'Name' }), inp,
        h('div', { class: 'lbl', text: 'Folder' }), folderPicker(all.folders, folder, (id) => { folder = id; }),
        Store.persistent ? h('p', { class: 'dlg-note', text: 'Kept on this phone. Layers and texts stay editable.' }) : h('p', { class: 'dlg-note warn', text: noKeep() }),
        h('div', { class: 'acts' }, no, ok)));
      let busy = false;
      const go = async () => {
        if (busy) return; busy = true;
        const name = tidy(inp.value) || 'Untitled';
        bd.remove();
        resolve(await Folders.saveAs(name, folder));
      };
      U.onTap(ok, go);
      U.onTap(no, () => { bd.remove(); resolve(false); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); go(); } });
      U.$('#sheets').appendChild(bd);
    });
  };

  /* ---------- project file out (download / share) ---------- */
  async function deliver(file, mode) {
    if (mode === 'share' && Native.on) {
      try { await Native.share(file, file.name); } catch (e) { U.toast((e && e.message) || 'Sharing did not work on this phone', 3600); }
      return;
    }
    if (mode === 'share') {
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      if (U.sandboxed()) { U.toast('This preview window cannot share or download files. Open the app in its own tab.', 4200); return; }
      Exporter.download(file, file.name);
      U.toast('This browser cannot share project files directly. ' + file.name + ' was saved to Downloads — send it from there.', 5000);
      return;
    }
    if (U.sandboxed()) { U.toast('This preview window cannot download files. Open the app in its own tab to get the project file.', 4200); return; }
    try { const where = await Exporter.download(file, file.name); U.toast('Saved ' + file.name + ' (' + kb(file.size) + ') — ' + where, 3600); }
    catch (e) { U.toast((e && e.message) || 'The file could not be saved', 3600); }
  }
  const asFile = (data, name) => new File([data], Project.fileName(name), { type: 'application/octet-stream' });
  /* the open document as a project file. mode: 'download' | 'share' */
  Folders.exportOpen = async function (mode) {
    if (!Doc.open) return;
    try {
      const pk = await U.busy(() => Project.pack({ progress: (a, b) => U.busyLabel('Packing… ' + a + ' / ' + b) }), 'Packing…');
      await deliver(asFile(pk.blob, Doc.name || 'project'), mode);
    } catch (e) { console.error(e); U.toast(e && e.message ? e.message : 'The project file could not be made', 3600); }
  };
  async function exportStored(m, mode) {
    try {
      const buf = await Store.load(m.id);
      if (!buf) throw new Error('This project is no longer in My folders');
      await deliver(asFile(buf, m.name), mode);
    } catch (e) { console.error(e); U.toast(e && e.message ? e.message : 'The project file could not be made', 3600); }
  }

  /* ---------- open a saved project (or the safety copy: id 'draft') ---------- */
  Folders.openProject = async function (id) {
    let notes = null;
    try {
      await U.busy(async () => {
        await chain;
        const meta = await Store.meta(id), buf = await Store.load(id);
        if (!meta || !buf) throw new Error('This project is no longer in My folders');
        const d = await Project.read(Zip.open(buf), (a, b) => U.busyLabel('Opening… ' + a + ' / ' + b));
        d.name = meta.name || d.name; d.pid = id === 'draft' ? null : id;
        Doc.load(d);
        notes = d.notes;
        if (id === 'draft') { restored = Doc.serial; draftOf = Doc.serial; draftRev = rev; } else { savedRev = rev; lastSaved = meta.modified || 0; }
      }, 'Opening…');
    } catch (e) { console.error(e); U.toast(e && e.message ? e.message : 'This project could not be opened', 3600); return false; }
    closePage();
    UI.showEditor();
    if (notes && notes.length) U.toast(notes[0], 3600);
    return true;
  };

  /* ---------- the menu inside the editor ---------- */
  Folders.menu = async function () {
    if (!Doc.open) return;
    let folderName = '';
    if (Doc.pid) { try { const m = await Store.meta(Doc.pid); if (m && m.folder) { const f = await Store.meta(m.folder); folderName = f ? f.name : ''; } } catch (e) { /* ignore */ } }
    const sh = UI.sheet('My folders', null);
    const row = (icon, label, fn, id) => {
      const b = h('button', { class: 'row-btn', type: 'button', id: id || null }, I.el(icon), h('span', { text: label }));
      U.onTap(b, () => { sh.close(); fn(); });
      return b;
    };
    const status = Doc.pid
      ? '“' + (Doc.name || 'Untitled') + '” is saved' + (folderName ? ' in the folder “' + folderName + '”' : ' in My folders') + (Store.persistent ? '. Every change is saved by itself.' : ' for now.')
      : 'This design is not saved as a project yet. A project keeps the layers and texts editable.';
    sh.body.append(h('p', { class: 'notes-h' + (Doc.pid ? ' good' : ''), id: 'mf-status', text: status }));
    if (!Doc.pid) sh.body.append(row('save', 'Save project', () => Folders.saveDialog(), 'mf-save'));
    else sh.body.append(row('edit', 'Rename project', renameOpen, 'mf-rename'), row('moveto', 'Move to folder', () => moveSheet(Doc.pid), 'mf-move'));
    sh.body.append(
      row('download', 'Download project file', () => Folders.exportOpen('download'), 'mf-download'),
      row('share', 'Share project file', () => Folders.exportOpen('share'), 'mf-share'),
      row('myfolders', 'Open My folders', async () => { await UI.closeEditor(); if (!Doc.open) Folders.open(); }, 'mf-open'));
    if (!Store.persistent) sh.body.append(h('p', { class: 'panel-note', text: noKeep() }));
  };
  async function renameOpen() {
    const name = await UI.prompt('Rename project', Doc.name || '', { ok: 'Rename', max: 60 });
    if (!name || !Doc.pid) return;
    Doc.name = name;
    try { await Store.patch(Doc.pid, { name: name }); U.toast('Renamed'); } catch (e) { U.toast(e.message || 'Could not rename', 3200); }
  }
  async function moveSheet(id, after) {
    let all, m;
    try { all = await Store.all(); m = await Store.meta(id); } catch (e) { U.toast(e.message || 'The storage did not open', 3200); return; }
    if (!m) return;
    const sh = UI.sheet('Move to folder', null);
    sh.body.append(folderPicker(all.folders, m.folder || '', async (fid) => {
      try { await Store.patch(id, { folder: fid }); } catch (e) { U.toast(e.message || 'Could not move', 3200); return; }
      lastFolder = fid;
      sh.close();
      const f = all.folders.find((q) => q.id === fid);
      U.toast(f ? 'Moved to “' + f.name + '”' : 'Taken out of its folder');
      if (after) after();
    }));
  }

  /* ---------- the My folders page ---------- */
  function closePage() {
    if (!page) return;
    const p = page; page = null;
    p.off(); p.el.remove();
    Folders.refreshHome();
  }
  Folders.close = closePage;
  Folders.isOpen = () => !!page;
  Folders.open = async function () {
    if (page) return;
    const el = h('div', { class: 'fd', id: 'folders' });
    const p = page = { el: el, folder: 'all', all: null, off: null };
    p.off = UI.overlay(closePage);
    p.note = h('div', { class: 'fd-note hidden' });
    p.chips = h('div', { class: 'chips fd-chips' });
    p.tools = h('div', { class: 'fd-tools hidden' });
    p.body = h('div', { class: 'fd-body' });
    p.foot = h('div', { class: 'fd-foot' });
    el.append(
      h('header', { class: 'fd-top' }, UI.tbtn('back', 'Back', closePage), h('span', { class: 'top-title', text: 'My folders' }),
        UI.tbtn('plus', 'New folder', async () => { const f = await newFolder(p.all ? p.all.folders : []); if (f && page === p) { p.folder = f.id; refresh(); } })),
      p.note, p.chips, p.tools, p.body, p.foot);
    document.body.appendChild(el);
    if (!Store.persistent) {
      await Store.ready();
      if (!Store.persistent && page === p) {
        p.note.classList.remove('hidden');
        p.note.textContent = noKeep();
      }
    }
    await refresh();
  };
  async function refresh() {
    const p = page;
    if (!p) return;
    let all;
    try { all = await Store.all(); }
    catch (e) { U.clear(p.body); p.body.appendChild(h('div', { class: 'fd-empty' }, h('b', { text: 'The storage did not open' }), h('span', { text: e.message || '' }))); return; }
    if (page !== p) return;
    p.all = all;
    if (p.folder !== 'all' && !all.folders.some((f) => f.id === p.folder)) p.folder = 'all';
    const inFolder = (id) => all.projects.filter((m) => (m.folder || '') === id).length;

    U.clear(p.chips);
    const chip = (id, label, extra) => {
      const b = h('button', { class: 'chip' + (extra || '') + (p.folder === id ? ' on' : ''), type: 'button', 'data-f': id }, h('span', { text: label }));
      p.chips.appendChild(b);
      return b;
    };
    U.onTap(chip('all', 'All · ' + all.projects.length), () => { p.folder = 'all'; refresh(); });
    for (const f of all.folders) U.onTap(chip(f.id, f.name + ' · ' + inFolder(f.id)), () => { p.folder = f.id; refresh(); });
    U.onTap(chip('+', '+ New folder', ' ghost'), async () => { const f = await newFolder(all.folders); if (f && page === p) { p.folder = f.id; refresh(); } });

    U.clear(p.tools);
    const cur = all.folders.find((f) => f.id === p.folder) || null;
    p.tools.classList.toggle('hidden', !cur);
    if (cur) {
      const ren = h('button', { class: 'mini', type: 'button', id: 'fd-rename' }, I.el('edit', 16), h('span', { text: 'Rename folder' }));
      const del = h('button', { class: 'mini', type: 'button', id: 'fd-delete' }, I.el('trash', 16), h('span', { text: 'Delete folder' }));
      U.onTap(ren, async () => {
        const name = await UI.prompt('Rename folder', cur.name, { ok: 'Rename', max: 30 });
        if (!name) return;
        try { await Store.patch(cur.id, { name: name }); } catch (e) { U.toast(e.message || 'Could not rename', 3200); }
        refresh();
      });
      U.onTap(del, async () => {
        const n = inFolder(cur.id);
        const ok = await UI.confirm('Delete this folder?', '“' + cur.name + '” is removed.' + (n ? ' Its ' + n + (n === 1 ? ' project is' : ' projects are') + ' kept and can be found under All.' : ''), 'Delete folder', 'Cancel');
        if (!ok) return;
        try {
          for (const m of all.projects) if (m.folder === cur.id) await Store.patch(m.id, { folder: '' });
          await Store.remove(cur.id);
        } catch (e) { U.toast(e.message || 'Could not delete', 3200); }
        if (page === p) { p.folder = 'all'; refresh(); }
      });
      p.tools.append(ren, del);
    }

    U.clear(p.body);
    const list = p.folder === 'all' ? all.projects : all.projects.filter((m) => m.folder === p.folder);
    if (!list.length) {
      p.body.appendChild(h('div', { class: 'fd-empty' }, I.el('myfolders', 46),
        h('b', { text: cur ? 'This folder is empty' : 'No saved projects yet' }),
        h('span', { text: cur ? 'To put a project here, tap ⋯ on it and choose “Move to folder”.' : 'Open a photo, a blank canvas or a PLP file, then choose My folders → Save project. A project keeps its layers and texts editable.' })));
    } else {
      const grid = h('div', { class: 'fd-grid' });
      const names = {};
      for (const f of all.folders) names[f.id] = f.name;
      for (const m of list) grid.appendChild(card(m, p.folder === 'all' ? names[m.folder] : null));
      p.body.appendChild(grid);
    }
    let bytes = 0;
    for (const m of all.projects) bytes += m.size || 0;
    p.foot.textContent = all.projects.length ? all.projects.length + (all.projects.length === 1 ? ' project' : ' projects') + ' · ' + kb(bytes) + (Store.persistent ? ' on this phone' : ' (not kept)') : '';
  }
  function card(m, folderName) {
    const img = h('img', { class: 'pj-img', alt: '', draggable: 'false' });
    if (m.thumb) img.src = m.thumb;
    const open = h('button', { class: 'pj-open', type: 'button', 'aria-label': 'Open ' + m.name },
      h('span', { class: 'pj-pic' }, img, folderName ? h('i', { class: 'pj-tag', text: folderName }) : null),
      h('b', { class: 'pj-name', text: m.name || 'Untitled' }),
      h('small', { text: when(m.modified) + ' · ' + kb(m.size) }));
    const more = h('button', { class: 'pj-more', type: 'button', title: 'More', 'aria-label': 'More for ' + m.name, html: I.svg('more', 20) });
    U.onTap(open, () => Folders.openProject(m.id));
    U.onTap(more, () => actions(m));
    return h('div', { class: 'pj', 'data-id': m.id }, open, more);
  }
  function actions(m) {
    const sh = UI.sheet(m.name || 'Untitled', null);
    const row = (icon, label, fn, cls) => {
      const b = h('button', { class: 'row-btn' + (cls ? ' ' + cls : ''), type: 'button', 'data-a': icon }, I.el(icon), h('span', { text: label }));
      U.onTap(b, () => { sh.close(); fn(); });
      return b;
    };
    sh.body.append(
      h('p', { class: 'notes-h dim', text: (m.width || '?') + ' × ' + (m.height || '?') + ' px · ' + (m.count || 0) + (m.count === 1 ? ' layer' : ' layers') + ' · ' + kb(m.size) + ' · changed ' + when(m.modified) }),
      row('image', 'Open', () => Folders.openProject(m.id)),
      row('edit', 'Rename', async () => {
        const name = await UI.prompt('Rename project', m.name || '', { ok: 'Rename', max: 60 });
        if (!name) return;
        try { await Store.patch(m.id, { name: name }); } catch (e) { U.toast(e.message || 'Could not rename', 3200); }
        refresh();
      }),
      row('moveto', 'Move to folder', () => moveSheet(m.id, refresh)),
      row('copy', 'Make a copy', async () => {
        try {
          const buf = await Store.load(m.id);
          if (!buf) throw new Error('This project is no longer in My folders');
          const now = Date.now();
          await Store.save(Object.assign({}, m, { id: Store.newId('p'), name: tidy((m.name || 'Untitled') + ' copy').slice(0, 60), created: now, modified: now }), buf.slice(0));
          U.toast('Copied');
        } catch (e) { U.toast(e.message || 'Could not copy', 3600); }
        refresh();
      }),
      row('download', 'Download project file', () => exportStored(m, 'download')),
      row('share', 'Share project file', () => exportStored(m, 'share')),
      row('trash', 'Delete', async () => {
        const ok = await UI.confirm('Delete this project?', '“' + (m.name || 'Untitled') + '” is removed from this phone. This cannot be undone.', 'Delete', 'Cancel');
        if (!ok) return;
        try { await Store.remove(m.id); U.toast('Deleted'); } catch (e) { U.toast(e.message || 'Could not delete', 3200); }
        refresh();
      }, 'danger'));
  }

  /* ---------- home screen: number of projects + "carry on with the unsaved edit" ---------- */
  Folders.refreshHome = async function () {
    let all;
    try { all = await Store.all(); } catch (e) { return; }
    const small = U.$('#btn-folders small'), slot = U.$('#draft-slot');
    const n = all.projects.length;
    if (small) small.textContent = n ? n + (n === 1 ? ' saved project' : ' saved projects') : 'Saved projects';
    if (!slot) return;
    U.clear(slot);
    const d = all.draft;
    if (!d || Doc.open) return;
    const img = h('img', { alt: '' });
    if (d.thumb) img.src = d.thumb;
    const go = h('button', { class: 'btn pri', type: 'button', text: 'Continue', id: 'btn-draft-open' });
    const del = h('button', { class: 'ibtn', type: 'button', title: 'Delete this unsaved edit', 'aria-label': 'Delete this unsaved edit', id: 'btn-draft-del', html: I.svg('close', 18) });
    U.onTap(go, () => Folders.openProject('draft'));
    U.onTap(del, async () => {
      const ok = await UI.confirm('Delete the unsaved edit?', 'It was never saved as a project. This cannot be undone.', 'Delete', 'Keep');
      if (!ok) return;
      await serial(() => Store.remove('draft')).catch(() => { });
      Folders.refreshHome();
    });
    slot.appendChild(h('div', { class: 'draft', id: 'draft-card' }, img,
      h('span', { class: 'draft-t' }, h('b', { text: 'Unfinished edit' }), h('small', { text: 'not saved · ' + when(d.modified) })), go, del));
  };

  /* ---------- wiring ---------- */
  Folders.init = function () {
    U.on('history', () => { rev++; schedule(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Folders.flush().catch(autoFail); });
    window.addEventListener('pagehide', () => { Folders.flush().catch(() => { }); });
    Store.ready().then(() => Folders.refreshHome());
  };
  Folders._state = () => ({ rev: rev, savedRev: savedRev, draftRev: draftRev, draftOf: draftOf, restored: restored, lastSaved: lastSaved, pending: Folders.pending(), timer: !!timer });
})();
