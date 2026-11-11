"""Remove BG with the AI add-on (app/ai): needs the app on http://localhost:8000 and the files fetched by tools/fetch_ai.py."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PHOTO = os.path.join(os.path.dirname(ROOT), 'uploads', 'IMG_20261111_091333.jpg')      # a man at night, dark shirt on a dark background (844 x 812)
# alpha of the background photo at a place given in px of the 844 x 812 original
ALPHA = "([x, y]) => { const b = RT.Doc.layers[0].bitmap, k = b.width / 844; return b.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3]; }"
KEPT = "(() => { const b = RT.Doc.layers[0].bitmap, d = b.getContext('2d').getImageData(0, 0, b.width, b.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n / (b.width * b.height); })()"
IDLE = "!document.querySelector('#busy.show')"

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    if not os.path.exists(os.path.join(ROOT, 'app', 'ai', 'modnet.onnx')):
        print('SKIPPED: the AI files are not in app/ai (run python3 tools/fetch_ai.py)'); return
    if not os.path.exists(PHOTO):
        print('SKIPPED: the test photo is not there:', PHOTO); return

    async def open_photo(s):
        p = s.page
        await p.goto('http://localhost:8000/')
        await p.wait_for_function("window.RT && RT.Fonts.list.length > 4", timeout=20000)
        ready = await p.evaluate("RT.AICut.check()")
        async with p.expect_file_chooser() as fc: await p.click('#btn-open')
        await (await fc.value).set_files(PHOTO)
        await p.wait_for_selector('#toolbar .tb-item[data-id="removebg"]', timeout=20000); await p.wait_for_timeout(400)
        return ready

    # ---------- the normal way: a worker does the work ----------
    async with Session() as s:
        p = s.page
        check('the add-on is found over http', await open_photo(s) is True)
        await s.tb('removebg')
        # on the web the first use asks before it downloads the models
        await p.wait_for_selector('.backdrop.center .dialog', timeout=10000)
        q = await p.evaluate("document.querySelector('.backdrop.center .dialog').textContent")
        check('the first use asks before downloading', 'Download the AI?' in q and ' MB' in q and 'not sent anywhere' in q, q[:120])
        await p.click('.backdrop.center .dialog .btn:not(.pri)'); await p.wait_for_timeout(300); await p.wait_for_function(IDLE, timeout=30000); await p.wait_for_timeout(300)
        check('“Not now” uses the colour way instead', await p.evaluate("(() => { const c = document.querySelector('#cut-ways .chip.on'); return c && c.dataset.v; })()") == 'plain')
        await s.top('Undo'); await p.wait_for_timeout(200)
        await p.click('#cut-ways .chip[data-v="auto"]')
        await p.wait_for_selector('.backdrop.center .dialog', timeout=10000)
        await p.click('.backdrop.center .dialog .btn.pri')
        await p.wait_for_function("document.querySelector('#busy.show')", timeout=10000)
        await p.wait_for_function(IDLE, timeout=120000); await p.wait_for_timeout(400)
        chips = await p.evaluate("Array.from(document.querySelectorAll('#cut-ways .chip')).map(c => c.dataset.v + (c.classList.contains('on') ? '*' : ''))")
        check('Remove BG opens with the AI way chosen', chips == ['auto*', 'person', 'object', 'plain'], str(chips))
        check('the work is done in a worker', await p.evaluate("RT.AICut.mode()") == 'worker')
        note = await p.evaluate("(document.querySelector('#panel .panel-note') || {}).textContent")
        check('it says which model was used', 'this time: person' in (note or ''), note)
        check('no Tolerance slider for the AI way', await p.evaluate("!document.querySelector('#panel .sl')"))
        await s.shot('d1_ai_auto')
        await p.click('#cut-ways .chip[data-v="object"]'); await p.wait_for_timeout(200); await p.wait_for_function(IDLE, timeout=120000)
        await s.shot('d2_ai_object')
        await p.click('#cut-ways .chip[data-v="plain"]'); await p.wait_for_timeout(200); await p.wait_for_function(IDLE, timeout=60000)
        check('the colour way shows its Tolerance slider', await p.evaluate("!!document.querySelector('#panel .sl')"))
        await p.click('#cut-ways .chip[data-v="person"]'); await p.wait_for_timeout(200); await p.wait_for_function(IDLE, timeout=120000); await p.wait_for_timeout(300)
        await s.top('Undo'); await p.wait_for_timeout(250)
        check('Undo inside the tool takes the AI step back', await p.evaluate("!RT.UI.mode().history.canUndo()"))
        await s.top('Redo'); await p.wait_for_timeout(250)
        await s.top('Apply'); await p.wait_for_function("!RT.UI.mode() && " + IDLE, timeout=30000); await p.wait_for_timeout(300)
        kept = await p.evaluate(KEPT)
        check('about a sixth of the photo is kept (the man)', 0.13 < kept < 0.24, '%.3f' % kept)
        spots = {'face': (270, 85), 'shirt': (260, 250), 'shorts': (280, 520), 'shoe': (385, 775), 'dark sky': (700, 80), 'sparks': (640, 430), 'grass': (90, 480), 'pavement': (620, 740)}
        got = {k: await p.evaluate(ALPHA, list(v)) for k, v in spots.items()}
        check('the man stays, the night around him goes', all(got[k] > 200 for k in ('face', 'shirt', 'shorts', 'shoe')) and all(got[k] < 30 for k in ('dark sky', 'sparks', 'grass', 'pavement')), str(got))
        check('one undo step in the editor', await p.evaluate("RT.History.idx") == 1)
        await s.shot('d3_ai_done')
        s.errors = [e for e in s.errors if 'Canvas2D' not in e]
        s.report()

    # ---------- where a worker cannot start (some web views): the page does the work itself ----------
    async with Session() as s:
        p = s.page
        await p.add_init_script("window.Worker = function () { throw new Error('workers are switched off for this test'); }; try { localStorage.setItem('rt-ai-ok', '1'); } catch (e) {}")
        await open_photo(s)
        await s.tb('removebg')
        await p.wait_for_function("document.querySelector('#busy.show')", timeout=10000)
        await p.wait_for_function(IDLE, timeout=180000); await p.wait_for_timeout(400)
        check('without workers the page does the work itself', await p.evaluate("RT.AICut.mode()") == 'page')
        await s.top('Apply'); await p.wait_for_function("!RT.UI.mode() && " + IDLE, timeout=30000); await p.wait_for_timeout(300)
        kept = await p.evaluate(KEPT)
        check('and the result is the same cut-out', 0.13 < kept < 0.24, '%.3f' % kept)
        s.errors = [e for e in s.errors if 'Canvas2D' not in e and 'AI worker' not in e]
        s.report()

    # ---------- opened as a plain file: no AI, the colour way as before ----------
    async with Session() as s:
        p = s.page
        await s.open('?demo')
        check('opened as a file the add-on is not used', await p.evaluate("RT.AICut.check()") is False)
        await s.tb('removebg'); await p.wait_for_timeout(300); await p.wait_for_function(IDLE, timeout=30000); await p.wait_for_timeout(300)
        check('no AI chips, the Tolerance slider is there', await p.evaluate("!document.querySelector('#cut-ways') && !!document.querySelector('#panel .sl')"))
        note = await p.evaluate("(document.querySelector('#panel .panel-note') || {}).textContent")
        check('the note says where the AI way works', 'Android app' in (note or ''), note)
        s.errors = [e for e in s.errors if 'Canvas2D' not in e]
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
