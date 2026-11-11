"""Projects: Save project -> My folders -> open again; saving by itself; folders; project file out and back in."""
import asyncio, sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

LAYERS = """(() => RT.Doc.layers.map(l => ({t: l.type, x: Math.round(l.x), y: Math.round(l.y), r: +l.rotation.toFixed(3), sx: +l.scaleX.toFixed(3), o: l.opacity, b: l.blend, v: l.visible, lock: l.locked,
    text: l.text || null, font: l.font || null, size: l.size || null, color: l.color || null, stroke: l.stroke ? l.stroke.on : null, bg: l.bg ? l.bg.on : null,
    bmp: l.bitmap ? l.bitmap.width + 'x' + l.bitmap.height : null})))()"""
# mean colour of the flattened picture on a coarse grid (to compare two renderings)
SIG = """(() => { const c = RT.Doc.flatten({fill: '#ffffff', maxDim: 64}); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push(d[i], d[i+1], d[i+2]); return o; })()"""
STORE = """(async () => { const a = await RT.Store.all(); return {persistent: RT.Store.persistent, projects: a.projects.map(m => ({name: m.name, folder: m.folder, size: m.size, count: m.count, w: m.width, h: m.height, thumb: (m.thumb || '').slice(0, 22), mod: m.modified})), folders: a.folders.map(f => f.name), draft: a.draft ? {size: a.draft.size, count: a.draft.count} : null}; })()"""

def diff(a, b):
    if len(a) != len(b): return 999
    return sum(abs(x - y) for x, y in zip(a, b)) / max(1, len(a))

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open('?demo')
        await p.evaluate("indexedDB.deleteDatabase('rongtuli')")
        await s.open('?demo')
        await p.wait_for_timeout(300)
        print('storage:', await p.evaluate(STORE))
        # --- build a small design: text + sticker ---
        await s.tb('text'); await p.wait_for_timeout(200)
        await p.fill('.te-in', 'Sunset\nবাংলা'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        await s.tb('stroke'); await p.click('#panel .sw[data-c="#000000"]'); await p.wait_for_timeout(100)
        await p.mouse.click(20, 80 + 56); await p.wait_for_timeout(200)
        await s.tb('sticker'); await p.wait_for_timeout(300)
        await p.locator('.sheet .st-cell').first.click(); await p.wait_for_timeout(400)
        await p.mouse.click(20, 80 + 56); await p.wait_for_timeout(200)
        before = await p.evaluate(LAYERS); sig0 = await p.evaluate(SIG)
        print('design:', [(l['t'], l['text'], l['bmp']) for l in before])
        check('3 layers made', len(before) == 3)

        # --- Save project ---
        await s.tb('myfolders'); await p.wait_for_timeout(250)
        print('menu status:', await p.inner_text('#mf-status'))
        await s.shot('80_mf_menu')
        await p.click('#mf-save'); await p.wait_for_timeout(300)
        await s.shot('81_save_dialog')
        await p.fill('#pj-name', 'Test one')
        await p.click('#btn-pj-save')
        await p.wait_for_function("RT.Doc.pid && !RT.Folders._state().pending", timeout=20000)
        await p.wait_for_timeout(400)
        st = await p.evaluate(STORE); print('after save:', st)
        check('stored in IndexedDB', st['persistent'] and len(st['projects']) == 1 and st['projects'][0]['name'] == 'Test one' and st['projects'][0]['count'] == 3)
        check('thumbnail kept', st['projects'][0]['thumb'].startswith('data:image/jpeg'))
        mod0 = st['projects'][0]['mod']

        # --- a change is saved by itself ---
        await p.evaluate("(() => { const l = RT.Doc.layers[1]; l.x += 40; l.rotation = 0.2; RT.History.commit(); RT.View.request(); })()")
        check('change is pending', await p.evaluate("RT.Folders._state().pending"))
        await p.wait_for_function("!RT.Folders._state().pending", timeout=15000)
        st = await p.evaluate(STORE)
        check('saved by itself', st['projects'][0]['mod'] > mod0, 'after %.1f s' % ((st['projects'][0]['mod'] - mod0) / 1000))
        after_edit = await p.evaluate(LAYERS); sig1 = await p.evaluate(SIG)

        # --- close (no question for a saved project), My folders shows it ---
        await s.top('Close'); await p.wait_for_timeout(500)
        check('home again without a question', await p.is_visible('#btn-open') and not await p.is_visible('.dialog'))
        await p.wait_for_timeout(300)
        print('home card:', (await p.inner_text('#btn-folders')).replace('\n', ' | '))
        await s.shot('82_home_count')
        await p.click('#btn-folders'); await p.wait_for_selector('.pj'); await p.wait_for_timeout(300)
        await s.shot('83_folders')
        check('one card', await p.locator('.pj').count() == 1)
        await p.click('.pj-open'); await p.wait_for_function("RT.Doc.open && RT.Doc.pid", timeout=20000); await p.wait_for_timeout(500)
        again = await p.evaluate(LAYERS); sig2 = await p.evaluate(SIG)
        check('layers come back the same', json.dumps(again) == json.dumps(after_edit), '' if json.dumps(again) == json.dumps(after_edit) else '\n     was %s\n     now %s' % (after_edit, again))
        check('picture looks the same', diff(sig1, sig2) < 1.5, 'mean difference %.2f / 255' % diff(sig1, sig2))
        check('text is still a text layer', again[1]['t'] == 'text' and again[1]['text'] == 'Sunset\nবাংলা')
        check('opened project is clean', not await p.evaluate("RT.Folders._state().pending") and not await p.evaluate("RT.History.dirty()"))
        await s.shot('84_reopened')

        # --- project file out (download) ---
        await s.tb('myfolders'); await p.wait_for_timeout(250)
        print('menu status:', await p.inner_text('#mf-status'))
        async with p.expect_download() as dl:
            await p.click('#mf-download')
        d = await dl.value
        path = '/tmp/shots/' + d.suggested_filename
        await d.save_as(path)
        import zipfile
        z = zipfile.ZipFile(path)
        print('project file:', d.suggested_filename, os.path.getsize(path), 'bytes', z.namelist(), 'test', z.testzip())
        check('file name', d.suggested_filename == 'Test one.rongtuli')
        pj = json.loads(z.read('project.json'))
        check('project.json', pj['app'] == 'RongTuli' and pj['format'] == 1 and len(pj['layers']) == 3 and pj['layers'][1]['type'] == 'text')
        check('photo as jpg, sticker as png', pj['layers'][0]['src'].endswith('.jpg') and pj['layers'][2]['src'].endswith('.png'), str([l.get('src') for l in pj['layers']]))
        await s.top('Close'); await p.wait_for_timeout(500)

        # --- folders: make, move, rename, copy, delete ---
        await p.click('#btn-folders'); await p.wait_for_selector('.pj'); await p.wait_for_timeout(200)
        await p.click('.fd-chips .chip.ghost'); await p.wait_for_timeout(200)
        await p.fill('.dialog .inp', 'Posters'); await p.click('.dialog .btn.pri'); await p.wait_for_timeout(400)
        await s.shot('85_empty_folder')
        check('new folder is shown and empty', await p.locator('.fd-empty').count() == 1 and 'Posters' in await p.inner_text('.fd-chips'))
        await p.click('.fd-chips .chip[data-f="all"]'); await p.wait_for_timeout(200)
        await p.click('.pj-more'); await p.wait_for_timeout(250); await s.shot('86_card_menu')
        await p.click('.row-btn[data-a="moveto"]'); await p.wait_for_timeout(250)
        await p.click('.sheet .fd-pick .chip:has-text("Posters")'); await p.wait_for_timeout(500)
        await p.click('.pj-more'); await p.wait_for_timeout(250)
        await p.click('.row-btn[data-a="copy"]'); await p.wait_for_timeout(600)
        await p.locator('.pj-more').first.click(); await p.wait_for_timeout(250)
        await p.click('.row-btn[data-a="edit"]'); await p.wait_for_timeout(250)
        await p.fill('.dialog .inp', 'Renamed copy'); await p.click('.dialog .btn.pri'); await p.wait_for_timeout(500)
        st = await p.evaluate(STORE); print('folders:', st['folders'], [(m['name'], bool(m['folder'])) for m in st['projects']])
        check('moved, copied, renamed', st['folders'] == ['Posters'] and sorted(m['name'] for m in st['projects']) == ['Renamed copy', 'Test one'] and all(m['folder'] for m in st['projects']))
        await s.shot('87_two_cards')
        await p.click('.fd-chips .chip:has-text("Posters")'); await p.wait_for_timeout(250)
        check('folder shows both', await p.locator('.pj').count() == 2)
        await p.click('#fd-delete'); await p.wait_for_timeout(200); await p.click('.dialog .btn.pri'); await p.wait_for_timeout(500)
        st = await p.evaluate(STORE)
        check('folder deleted, projects kept', st['folders'] == [] and len(st['projects']) == 2 and not any(m['folder'] for m in st['projects']))
        await p.locator('.pj[data-id] .pj-more').first.click(); await p.wait_for_timeout(250)
        await p.click('.row-btn[data-a="trash"]'); await p.wait_for_timeout(200); await p.click('.dialog .btn.pri'); await p.wait_for_timeout(500)
        st = await p.evaluate(STORE)
        check('one project deleted', len(st['projects']) == 1)
        await p.click('.fd-top button[title="Back"]'); await p.wait_for_timeout(300)
        check('My folders closed', await p.locator('.fd').count() == 0 and await p.is_visible('#btn-open'))

        # --- still there after the page is loaded again ---
        await s.open()
        await p.wait_for_timeout(500)
        st = await p.evaluate(STORE)
        check('kept after reload', len(st['projects']) == 1, (await p.inner_text('#btn-folders')).replace('\n', ' | '))

        # --- the downloaded file opens again ---
        async with p.expect_file_chooser() as fc:
            await p.click('#btn-plp')
        await (await fc.value).set_files(path)
        await p.wait_for_function("RT.Doc.open", timeout=20000); await p.wait_for_timeout(500)
        back = await p.evaluate(LAYERS); sig3 = await p.evaluate(SIG)
        check('file opens with the same layers', json.dumps(back) == json.dumps(after_edit))
        check('file looks the same', diff(sig1, sig3) < 1.5, 'mean difference %.2f / 255' % diff(sig1, sig3))
        check('name comes from the file', await p.evaluate("RT.Doc.name") == 'Test one' and await p.evaluate("RT.Doc.pid") is None)
        await s.top('Close'); await p.wait_for_timeout(400)
        check('unchanged file closes without a question', await p.is_visible('#btn-open') and not await p.is_visible('.dialog'))
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
