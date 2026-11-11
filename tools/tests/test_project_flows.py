"""Projects, the less common paths: the safety copy of an unsaved edit, the questions on closing, saving while a tool is open,
the page going to the background, a full storage, the phone's Back button on the My folders page."""
import asyncio, sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

STORE = """(async () => { const a = await RT.Store.all(); return {n: a.projects.length, names: a.projects.map(m => m.name), folders: a.folders.map(f => f.name), draft: a.draft ? a.draft.count : null}; })()"""
ADD_TEXT = """(() => { const l = RT.Layers.text('Draft text', {x: RT.Doc.width / 2, y: RT.Doc.height / 3, size: 120, color: '#ffee00'}); RT.Doc.add(l); RT.History.commit(); RT.View.request(); })()"""
STATE = "RT.Folders._state()"

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open()
        await p.evaluate("indexedDB.deleteDatabase('rongtuli')")

        # ---------- A. the safety copy ----------
        await s.open('?demo'); await p.wait_for_timeout(300)
        check('nothing to keep in a fresh demo', not await p.evaluate("RT.Folders.unsaved()"))
        await p.evaluate(ADD_TEXT)
        check('an unsaved change is pending', (await p.evaluate(STATE))['pending'])
        await p.wait_for_function("!RT.Folders._state().pending", timeout=15000)
        st = await p.evaluate(STORE); print('store:', st)
        check('safety copy written, no project made', st['draft'] == 2 and st['n'] == 0)
        await s.open(); await p.wait_for_selector('#draft-card', timeout=8000)      # the page was closed without saving
        await s.shot('90_draft_card')
        print('card:', (await p.inner_text('#draft-card')).replace('\n', ' | '))
        await p.click('#btn-draft-open'); await p.wait_for_function("RT.Doc.open", timeout=15000); await p.wait_for_timeout(400)
        got = await p.evaluate("RT.Doc.layers.map(l => l.type + ':' + (l.text || ''))")
        check('the edit is back', got == ['image:', 'text:Draft text'], str(got))
        check('still not a project, and counted as unsaved', await p.evaluate("RT.Doc.pid") is None and await p.evaluate("RT.Folders.unsaved()"))
        await s.top('Close'); await p.wait_for_timeout(300)
        await s.shot('91_close_question')
        check('asked what to do', await p.locator('.dialog .btn').count() == 3, str(await p.locator('.dialog .btn').all_inner_texts()))
        await p.click('.dialog .btn[data-v="stay"]'); await p.wait_for_timeout(200)
        check('"Keep editing" stays', await p.evaluate("RT.Doc.open") and not await p.is_visible('.dialog'))
        await s.top('Close'); await p.wait_for_timeout(300)
        await p.click('.dialog .btn[data-v="save"]'); await p.wait_for_timeout(300)
        check('save dialog shown', await p.is_visible('#pj-name'), 'suggested name: ' + await p.input_value('#pj-name'))
        await p.fill('#pj-name', '  From   draft '); await p.click('#btn-pj-save')
        await p.wait_for_selector('#btn-open', state='visible', timeout=15000); await p.wait_for_timeout(600)
        st = await p.evaluate(STORE); print('store:', st)
        check('saved as a project, safety copy gone, home again', st == {'n': 1, 'names': ['From draft'], 'folders': [], 'draft': None} and not await p.evaluate("RT.Doc.open"))
        check('no card on the home screen', await p.locator('#draft-card').count() == 0)

        # "Don't save" throws the work away, including its safety copy
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        await p.evaluate(ADD_TEXT)
        await p.wait_for_function("!RT.Folders._state().pending", timeout=15000)
        check('safety copy of the second edit', (await p.evaluate(STORE))['draft'] == 2)
        await s.top('Close'); await p.wait_for_timeout(300)
        await p.click('.dialog .btn[data-v="no"]'); await p.wait_for_timeout(700)
        st = await p.evaluate(STORE)
        check('"Don\'t save": home, nothing kept', st['draft'] is None and st['n'] == 1 and await p.is_visible('#btn-open'))

        # a safety copy that was never opened again is not lost when another edit starts: it moves into My folders
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        await p.evaluate(ADD_TEXT)
        await p.wait_for_function("!RT.Folders._state().pending", timeout=15000)
        await s.open(); await p.wait_for_selector('#draft-card', timeout=8000)          # page closed; the card is ignored
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        await p.evaluate(ADD_TEXT); await p.evaluate(ADD_TEXT)
        await p.wait_for_function("!RT.Folders._state().pending", timeout=15000)
        st = await p.evaluate(STORE); print('store:', st)
        check('older safety copy became a project', st['n'] == 2 and any(n.startswith('Unsaved edit ') for n in st['names']) and st['draft'] == 3)
        await s.top('Close'); await p.wait_for_timeout(300); await p.click('.dialog .btn[data-v="no"]'); await p.wait_for_timeout(700)
        check('and the new edit was thrown away as asked', (await p.evaluate(STORE))['draft'] is None)

        # a safety copy stays while a saved project is opened and closed
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        await p.evaluate(ADD_TEXT)
        await p.wait_for_function("!RT.Folders._state().pending", timeout=15000)
        await s.open(); await p.wait_for_selector('#draft-card', timeout=8000)
        await p.click('#btn-folders'); await p.wait_for_selector('.pj'); await p.locator('.pj-open').first.click()
        await p.wait_for_function("RT.Doc.open && RT.Doc.pid", timeout=15000); await p.wait_for_timeout(300)
        await p.evaluate("(() => { RT.Doc.layers[1].y += 5; RT.History.commit(); })()")
        await s.top('Close'); await p.wait_for_selector('#draft-card', timeout=8000)
        check('safety copy untouched by another project', (await p.evaluate(STORE))['draft'] == 2)
        # the card can be thrown away from the home screen
        await p.click('#btn-draft-del'); await p.wait_for_timeout(200); await p.click('.dialog .btn.pri'); await p.wait_for_timeout(700)
        check('unsaved edit deleted from the home screen', await p.locator('#draft-card').count() == 0 and (await p.evaluate(STORE))['draft'] is None)
        await p.evaluate("(async () => { const a = await RT.Store.all(); for (const m of a.projects) if (m.name.indexOf('Unsaved edit ') === 0) await RT.Store.remove(m.id); })()")

        # ---------- B. no saving while a tool is open; C. saving at once when the page goes to the background ----------
        await p.click('#btn-folders'); await p.wait_for_selector('.pj'); await p.click('.pj-open')
        await p.wait_for_function("RT.Doc.open && RT.Doc.pid", timeout=15000); await p.wait_for_timeout(400)
        await p.evaluate("(() => { RT.Doc.layers[1].y += 30; RT.History.commit(); })()")
        await s.tb('tools'); await p.click('.tool-cell[data-id="adjust"]'); await p.wait_for_timeout(300)
        await p.wait_for_timeout(4600)
        check('waits while a tool is open', (await p.evaluate(STATE))['pending'] and await p.evaluate("!!RT.UI.mode()"))
        await s.top('Cancel')
        await p.wait_for_function("!RT.Folders._state().pending", timeout=9000)
        check('saved after the tool closed', True)
        await p.evaluate("(() => { RT.Doc.layers[1].y -= 30; RT.History.commit(); })()")
        await p.evaluate("(() => { Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); })()")
        await p.wait_for_function("!RT.Folders._state().pending", timeout=1800)
        check('saved at once when the page is hidden', True)
        await p.evaluate("delete document.visibilityState")

        # ---------- D. the storage is full ----------
        await s.top('Close'); await p.wait_for_timeout(500)
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        await p.evaluate(ADD_TEXT)
        await p.evaluate("(() => { RT.Store._save = RT.Store.save; RT.Store.save = async () => { throw new Error('The storage of this phone is full. Delete some old projects (or other files) and try again.'); }; })()")
        res = await p.evaluate("RT.Folders.saveAs('Will fail', '')")
        toast = await p.inner_text('#toast')
        check('a full storage is reported, nothing half-saved', res is False and await p.evaluate("RT.Doc.pid") is None and 'full' in toast, toast[:60])
        await p.evaluate("void (RT.Store.save = RT.Store._save)")
        res = await p.evaluate("RT.Folders.saveAs('Second', '')")
        check('works again afterwards', res is True and (await p.evaluate(STORE))['n'] == 2)
        # a project that cannot be saved on closing: the user may stay
        await p.evaluate("(() => { RT.Doc.layers[1].y += 9; RT.History.commit(); RT.Store.save = async () => { throw new Error('The storage of this phone is full.'); }; })()")
        await s.top('Close'); await p.wait_for_timeout(700)
        check('closing with a failed save asks first', await p.is_visible('.dialog') and 'could not be saved' in await p.inner_text('.dialog h3'), (await p.inner_text('.dialog p'))[:70])
        await p.click('.dialog .btn:not(.pri)'); await p.wait_for_timeout(200)
        check('"Stay" keeps the editor open', await p.evaluate("RT.Doc.open"))
        await p.evaluate("void (RT.Store.save = RT.Store._save)")
        await s.top('Close'); await p.wait_for_timeout(700)
        check('closes once saving works', await p.is_visible('#btn-open') and not await p.evaluate("RT.Doc.open"))
        s.errors = [e for e in s.errors if 'storage of this phone is full' not in e]      # the failures made on purpose above
        s.report()

    # ---------- E. the phone's Back button (needs the app on http://localhost:8000) ----------
    async with Session() as s:
        p = s.page
        await p.goto('http://localhost:8000/'); await p.wait_for_function("window.RT && RT.Fonts.list.length > 4", timeout=20000)
        await p.evaluate("(async () => { const a = await RT.Store.all(); for (const m of a.projects.concat(a.folders)) await RT.Store.remove(m.id); await RT.Store.remove('draft'); })()")
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        await p.evaluate("RT.Folders.saveAs('Back test', '')"); await p.wait_for_timeout(300)
        await s.top('Close'); await p.wait_for_timeout(500)
        async def back():
            await p.go_back(wait_until='commit'); await p.wait_for_timeout(300)
            return await p.evaluate("({page: !!document.querySelector('.fd'), sheets: document.querySelectorAll('#sheets .backdrop').length, home: !document.querySelector('#home').classList.contains('hidden'), url: location.pathname})")
        await p.click('#btn-folders'); await p.wait_for_selector('.pj')
        await p.click('.pj-more'); await p.wait_for_timeout(250)
        await p.click('.row-btn[data-a="edit"]'); await p.wait_for_timeout(250)
        r = await back(); check('Back closes the rename box first', r == {'page': True, 'sheets': 0, 'home': True, 'url': '/'}, str(r))
        await p.click('.pj-more'); await p.wait_for_timeout(250)
        r = await back(); check('Back closes the card menu', r['page'] and r['sheets'] == 0, str(r))
        r = await back(); check('Back closes My folders', not r['page'] and r['home'] and r['url'] == '/', str(r))
        # from the editor: My folders -> Open My folders
        await p.click('#btn-folders'); await p.wait_for_selector('.pj'); await p.click('.pj-open')
        await p.wait_for_function("RT.Doc.open && RT.Doc.pid", timeout=15000); await p.wait_for_timeout(300)
        await s.tb('myfolders'); await p.wait_for_timeout(250); await p.click('#mf-open')
        await p.wait_for_selector('.fd', timeout=8000); await p.wait_for_timeout(300)
        check('"Open My folders" leaves the editor and shows the page', not await p.evaluate("RT.Doc.open") and await p.locator('.pj').count() == 1)
        await s.shot('92_folders_from_editor')
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
