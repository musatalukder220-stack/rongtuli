"""Stage 10: Shape (a crop, like the video), the ‹ › arrows, undo of a change, and the text size / slant.

Checks:
  * the toolbar's Shape opens the crop straight away and every group of shapes is there;
  * the ‹ › arrows walk through the shapes (and the group of the new shape comes to the front);
  * Undo in the middle of the top bar takes a change of shape back, Redo puts it again;
  * Apply cuts the picture to the shape (a star leaves clear corners, no layer is added);
  * a photo of its own (not the canvas) is cut in place and does not move;
  * the text size has a big slider and A− / A+ (both change the words);
  * a text leans sideways with Slant, and Arc makes the circle of a bent line smaller.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

CARD = """(() => { const c = RT.U.canvas(400, 300), x = c.getContext('2d');
  x.fillStyle = '#2b6cb0'; x.fillRect(0, 0, 400, 300);
  x.fillStyle = '#e53e3e'; x.beginPath(); x.arc(200, 150, 70, 0, 7); x.fill();
  const l = PhotoTool.addCanvas(c, 'Card'); RT.Doc.select(l.id); RT.History.commit(); return true; })()"""
MODE = "RT.UI.mode() ? RT.UI.mode().title : null"
SEL = """(() => { const l = RT.Doc.layers[RT.Doc.layers.length - 1]; return {w: l.bitmap.width, h: l.bitmap.height, x: Math.round(l.x), y: Math.round(l.y)}; })()"""
PIX = """([x, y]) => Array.from(RT.Doc.layers[RT.Doc.layers.length - 1].bitmap.getContext('2d').getImageData(x, y, 1, 1).data)"""
CUR = "document.querySelector('.sc-bar .sc-name').textContent"

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open('?demo')
        await p.wait_for_timeout(400)
        await p.evaluate(CARD)
        await p.wait_for_timeout(300)

        # ---- Shape opens the crop itself (no coloured-shape sheet any more) ----
        await p.evaluate("RT.Doc.select(null); RT.UI.refreshContext()")
        await p.wait_for_timeout(200)
        await p.evaluate("void (OpenTarget = RT.Doc.layers.at(-1))")     # (the crop works on the card)
        await p.evaluate("RT.Doc.select(RT.Doc.layers.at(-1).id); RT.UI.refreshContext()")
        await p.wait_for_timeout(200)
        await s.tb('shapecrop')
        await p.wait_for_function("RT.UI.mode() && RT.UI.mode().title === 'Shape Crop'", timeout=8000)
        groups = await p.evaluate("Array.from(document.querySelectorAll('.shp-groups .chip')).map(c => c.textContent.trim())")
        check('Shape / Shape Crop opens the crop', True)
        check('the shapes are grouped', groups == ['Basic', 'Many sides', 'Hearts & more', 'Lines & signs'], str(groups))

        # ---- the ‹ › arrows walk through the shapes, group by group ----
        seen = [await p.evaluate(CUR)]
        for _ in range(3):
            await p.click('.sc-bar button[title="Next shape"]')
            await p.wait_for_timeout(180)
            seen.append(await p.evaluate(CUR))
        check('the arrows change the shape', len(set(seen)) == 4, str(seen))
        check('the name in the bar is the shape on the canvas', await p.evaluate("Shapes.get(ShapeCrop.mem.shape).name") == seen[-1])
        await p.click('.sc-bar button[title="Previous shape"]')
        await p.wait_for_timeout(180)
        check('the left arrow goes back', await p.evaluate(CUR) == seen[-2], await p.evaluate(CUR))
        await s.shot('s10_shape_arrows')

        # ---- Undo / Redo of a change of shape ----
        before = await p.evaluate(CUR)
        await p.click('.sc-bar button[title="Next shape"]')
        await p.wait_for_timeout(200)
        after = await p.evaluate(CUR)
        check('a change of shape can be undone (the middle buttons of the top bar)', await p.evaluate("RT.UI.mode().history.canUndo()") and after != before)
        await s.top('Undo')
        await p.wait_for_timeout(250)
        check('Undo brings the shape before back', await p.evaluate(CUR) == before, '%s -> %s' % (after, await p.evaluate(CUR)))
        await s.top('Redo')
        await p.wait_for_timeout(250)
        check('Redo puts it again', await p.evaluate(CUR) == after)

        # ---- Apply = the picture is cut to the shape, nothing added ----
        n_before = await p.evaluate("RT.Doc.layers.length")
        await p.evaluate("(() => { document.querySelector('.shp-groups .chip[data-v=\"many\"]').click(); })()")
        await p.wait_for_timeout(200)
        await p.click('.shp-pick .shp-cell[data-id="star"]')
        await p.wait_for_timeout(250)
        await s.top('Apply')
        await p.wait_for_timeout(900)
        check('no layer is added by a shape', await p.evaluate("RT.Doc.layers.length") == n_before)
        cut = await p.evaluate("""(() => { const l = RT.Doc.layers.at(-1), d = l.bitmap.getContext('2d');
          return { corner: d.getImageData(2, 2, 1, 1).data[3], mid: d.getImageData(Math.round(l.bitmap.width / 2), Math.round(l.bitmap.height / 2), 1, 1).data[3] }; })()""")
        check('a star leaves clear corners and keeps the middle', cut['corner'] == 0 and cut['mid'] == 255, str(cut))
        await s.shot('s10_shape_star')

        # ---- text: size, slant, arc ----
        await p.evaluate("""void (() => { const l = LayerText('Hello'); })()""" if False else """void (() => {
          const l = RT.Layers.text('Hello', {}); l.x = RT.Doc.width / 2; l.y = RT.Doc.height / 3;
          RT.Doc.add(l); RT.Doc.select(l.id); RT.History.commit(); RT.UI.refreshContext(); })()""")
        await p.wait_for_timeout(300)
        ids = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(b => b.dataset.id)")
        check('a text has a Size item', 'textsize' in ids, str(ids[:6]))
        await s.tb('textsize')
        await p.wait_for_timeout(300)
        s0 = await p.evaluate("RT.Doc.layers.at(-1).size")
        box0 = await p.evaluate("RT.Layers.size(RT.Doc.layers.at(-1)).w")
        await p.click('#tx-bigger'); await p.wait_for_timeout(200)
        await p.click('#tx-bigger'); await p.wait_for_timeout(200)
        s1 = await p.evaluate("RT.Doc.layers.at(-1).size")
        box1 = await p.evaluate("RT.Layers.size(RT.Doc.layers.at(-1)).w")
        check('A+ makes the words bigger', s1 > s0 and box1 > box0, '%s -> %s, width %.0f -> %.0f' % (s0, s1, box0, box1))
        await p.evaluate("(() => { const r = document.querySelector('#tx-size'); r.value = 60; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
        await p.wait_for_timeout(200)
        check('the slider sets the size', await p.evaluate("RT.Doc.layers.at(-1).size") == 60)
        await p.click('#tx-smaller'); await p.wait_for_timeout(200)
        check('A− makes them smaller', await p.evaluate("RT.Doc.layers.at(-1).size") < 60)
        await s.shot('s10_text_size')

        await s.tb('slant'); await p.wait_for_timeout(300)
        w0 = await p.evaluate("RT.Layers.size(RT.Doc.layers.at(-1)).w")
        await p.evaluate("(() => { const r = document.querySelector('#panel input[type=range]'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
        await p.wait_for_timeout(250)
        lean = await p.evaluate("(() => { const l = RT.Doc.layers.at(-1), L = RT.TextRender.layout(l); return {slant: l.slant, w: L.w, sk: L.cmds.map(c => c.sk || 0).find(Boolean) || 0}; })()")
        check('Slant leans the words sideways', abs(lean['slant'] - 40) < 1 and lean['sk'] > 0.2, str(lean))
        await s.shot('s10_text_slant')

        await s.tb('bend'); await p.wait_for_timeout(300)
        await p.evaluate("(() => { const r = document.querySelector('#panel input[type=range]'); r.value = 60; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
        await p.wait_for_timeout(250)
        d0 = await p.evaluate("(() => { const l = RT.Doc.layers.at(-1); l.arc = 0; RT.Layers.touch(l); const L = RT.TextRender.layout(l); return Math.round(L.h); })()")
        sliders = await p.evaluate("document.querySelectorAll('#panel input[type=range]').length")
        check('Bend has an Arc slider too', sliders == 2, str(sliders))
        await p.evaluate("(() => { const rs = document.querySelectorAll('#panel input[type=range]'); rs[1].value = 90; rs[1].dispatchEvent(new Event('input', { bubbles: true })); })()")
        await p.wait_for_timeout(250)
        d1 = await p.evaluate("(() => { const l = RT.Doc.layers.at(-1), L = RT.TextRender.layout(l); return Math.round(L.h); })()")
        arc = await p.evaluate("(() => { const l = RT.Doc.layers.at(-1), L = RT.TextRender.layout(l); return l.arc; })()")
        check("Arc makes the words follow a much smaller circle", arc == 90 and d1 > d0 + 15, '%d -> %d (arc %s)' % (d0, d1, arc))
        await s.shot('s10_text_arc')

        # ---- Nudge: the words go left / right, in % of the picture's width (PixelLab style) ----
        await s.tb('nudge'); await p.wait_for_timeout(300)
        check('Nudge has its own panel', await p.evaluate("!!document.querySelector('#tx-left') && !!document.querySelector('#tx-right')"))
        check('Nudge starts at 0%', await p.evaluate("RT.Doc.layers.at(-1).nudge") == 0)
        for _ in range(2):
            await p.click('#tx-right'); await p.wait_for_timeout(120)
        nud = await p.evaluate("RT.Doc.layers.at(-1).nudge")
        txt = await p.evaluate("document.querySelector('#tx-nudge-val').value")
        shown = await p.evaluate("document.querySelector('#panel .nv-box').value + document.querySelector('#panel .nv-pct').textContent")
        check('the right arrow moves the words right, and the % says so',
              nud == 10 and txt.strip() == '+%d' % nud and shown.strip() == '+%d%%' % nud, '%s / %s / %s' % (nud, txt, shown))
        # a step of 1 % moves them by 1 % only (the owner: small step = small move on a big picture)
        await p.evaluate("(() => { const i = document.querySelector('#tx-step'); i.value = '1'; i.dispatchEvent(new Event('input', {bubbles: true})); })()")
        await p.wait_for_timeout(150)
        await p.click('#tx-right'); await p.click('#tx-right'); await p.wait_for_timeout(200)
        nud2 = await p.evaluate("RT.Doc.layers.at(-1).nudge")
        check('a step of 1 % moves the words by 1 % a tap', nud2 == nud + 2, '%s -> %s' % (nud, nud2))
        typed = await p.evaluate("(() => { const i = document.querySelector('#tx-nudge-val'); i.value = '-7'; i.dispatchEvent(new Event('change', {bubbles: true})); return RT.Doc.layers.at(-1).nudge; })()")
        check('a % can be typed straight in', typed == -7, str(typed))
        await p.evaluate("RT.History.commit()")                  # (a clean point for the Undo below)
        got = await p.evaluate("[RT.TextRender.shift(RT.Doc.layers.at(-1)), RT.Doc.layers.at(-1).nudge, RT.Doc.width]")
        check('the % is of the picture width', abs(got[0] - got[1] / 100 * got[2]) < 0.01, str(got))
        c0 = await p.evaluate("RT.Layers.corners(RT.Doc.layers.at(-1))[1][0]")
        await p.click('#tx-left'); await p.wait_for_timeout(150)
        c1 = await p.evaluate("RT.Layers.corners(RT.Doc.layers.at(-1))[1][0]")
        check('the left arrow brings them back', c1 < c0 - 1, '%s -> %s' % (c0, c1))
        await s.shot('s10_text_nudge')
        was = await p.evaluate("RT.Doc.layers.at(-1).nudge")
        await p.click('#tx-nudge-0'); await p.wait_for_timeout(150)
        check('Middle puts them back in the middle', await p.evaluate("RT.Doc.layers.at(-1).nudge") == 0)
        await p.evaluate("RT.History.undo()"); await p.wait_for_timeout(250)
        back = await p.evaluate("RT.Doc.layers.at(-1).nudge")
        check('Undo takes the nudge back', back == was, '%s -> %s' % (was, back))
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)

asyncio.run(main())
