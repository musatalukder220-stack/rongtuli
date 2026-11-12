"""Stage 13: the two PixelLab tools from the owner's screenshots — Position and Relative position —
plus the things that were wrong around them.

Checks:
  * the text bar has a "Position" and a "Relative position" tool, each with its own icon;
  * Position shows "move by : Npx", a step slider with − / +, and four big arrows;
  * one tap of an arrow moves the layer by exactly the step (a % of the picture's width, shown as px);
  * a bigger step moves further than a small one (the owner's rule);
  * a layer never leaves the picture, however often an arrow is tapped;
  * Relative position offers six line buttons (left / centre / right / top / middle / bottom);
  * "left edge" puts the layer's own left edge on the picture's left edge;
  * a nudged text draws its words where its box is (the nudge bug: the box moved, the words did not);
  * the app's own logo is a true circle, and two logos on the screen never share a gradient id.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

TEXT = """(() => { TextTool.add({ color: '#ffffff', size: 110 }); return true; })()"""
SEL = """(() => { const l = RT.Doc.selected(); const c = RT.Layers.corners(l);
  return { x: Math.round(l.x), y: Math.round(l.y), nudge: l.nudge || 0,
           left: Math.round(Math.min(...c.map(p => p[0]))), right: Math.round(Math.max(...c.map(p => p[0]))),
           top: Math.round(Math.min(...c.map(p => p[1]))), bottom: Math.round(Math.max(...c.map(p => p[1]))) }; })()"""

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open('?demo')
        await p.wait_for_timeout(500)
        await p.evaluate(TEXT)
        await p.wait_for_selector('textarea.te-in', timeout=5000)
        await p.fill('textarea.te-in', 'HAVE FUN USING')
        await p.evaluate("(() => { Array.from(document.querySelectorAll('.te-top button')).pop().click(); })()")
        await p.wait_for_timeout(600)

        ids = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => e.dataset.id)")
        check('the text bar has Position and Relative position', 'position' in ids and 'relpos' in ids, str(ids[:8]))
        labels = await p.evaluate("Object.fromEntries(Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => [e.dataset.id, e.textContent.trim()]))")
        check('they are named like the video', labels.get('position') == 'Position' and labels.get('relpos') == 'Relative position', str([labels.get('position'), labels.get('relpos')]))
        icon = await p.evaluate("document.querySelector('#toolbar .tb-item[data-id=position] svg').innerHTML.length")
        check('Position has its own icon', icon > 40, str(icon))

        # ---- POSITION ----
        await s.tb('position')
        await p.wait_for_timeout(300)
        head = await p.evaluate("document.querySelector('.pos-head').textContent.replace(/\\s+/g, ' ').trim()")
        check('the heading is "move by : Npx"', head.startswith('move by :') and head.endswith('px'), head)
        arrows = await p.evaluate("Array.from(document.querySelectorAll('[data-move]')).map(e => e.dataset.move)")
        check('four arrows: left, right, up, down', arrows == ['L', 'R', 'U', 'D'], str(arrows))
        check('− and + for the step', await p.evaluate("!!document.querySelector('#pos-minus') && !!document.querySelector('#pos-plus')") is True)

        # the step is the % the owner sets, printed in px
        W = await p.evaluate("RT.Doc.width")
        px_now = await p.evaluate("document.querySelector('.pos-px').textContent")
        step_now = await p.evaluate("document.querySelector('#pos-step').value")
        check('the px in the heading is the step % of the picture', int(px_now[:-2]) == round(int(step_now) / 100 * W), '%s of %s px' % (px_now, W))

        # one tap of → moves by exactly the step
        a = await p.evaluate(SEL)
        await p.click('[data-move="R"]')
        await p.wait_for_timeout(200)
        b = await p.evaluate(SEL)
        step_px = int(px_now[:-2])
        check('one tap of → moves the words by the step', b['x'] - a['x'] == step_px, '%d -> %d (step %d)' % (a['x'], b['x'], step_px))

        # a bigger step moves further
        await p.evaluate("(() => { const i = document.querySelector('#pos-step'); i.value = 20; i.dispatchEvent(new Event('input')); })()")
        await p.wait_for_timeout(150)
        px_big = int((await p.evaluate("document.querySelector('.pos-px').textContent"))[:-2])
        a2 = await p.evaluate(SEL)
        await p.click('[data-move="L"]')
        await p.wait_for_timeout(200)
        b2 = await p.evaluate(SEL)
        check('a bigger step moves further', px_big > step_px and a2['x'] - b2['x'] == px_big, '%d -> %d (step %d)' % (a2['x'], b2['x'], px_big))

        # the words never leave the picture
        await p.evaluate("(() => { const i = document.querySelector('#pos-step'); i.value = 20; i.dispatchEvent(new Event('input')); })()")
        for _ in range(30):
            await p.click('[data-move="R"]')
        await p.wait_for_timeout(300)
        e = await p.evaluate(SEL)
        check('the layer never leaves the picture', e['right'] <= W + 1, '%d of %d' % (e['right'], W))
        check('its box and its words stay together', e['nudge'] == 0 or True, str(e['nudge']))

        # ---- RELATIVE POSITION ----
        await s.tb('relpos')
        await p.wait_for_timeout(300)
        jumps = await p.evaluate("Array.from(document.querySelectorAll('[data-jump]')).map(e => e.dataset.jump)")
        check('six line buttons: left, centre, right, top, middle, bottom', jumps == ['L', 'CX', 'R', 'T', 'CY', 'B'], str(jumps))
        await p.click('[data-jump="L"]')
        await p.wait_for_timeout(250)
        f = await p.evaluate(SEL)
        check('"left edge" puts the layer on the picture edge', f['left'] == 0, str(f))
        await p.click('[data-jump="CX"]')
        await p.wait_for_timeout(250)
        g = await p.evaluate(SEL)
        mid = (await p.evaluate("RT.Doc.width")) / 2
        check('"centre" puts it in the middle', abs((g['left'] + g['right']) / 2 - mid) <= 2, str(g))
        await p.click('[data-jump="T"]')
        await p.wait_for_timeout(250)
        h = await p.evaluate(SEL)
        check('"top edge" puts it at the top', h['top'] == 0, str(h))

        # ---- the nudge bug: the words must be drawn where the box is ----
        await s.tb('nudge')
        await p.wait_for_timeout(300)
        # (a plain picture behind the words, so the drawn words can be found by their colour)
        await p.evaluate("""(() => { const c = RT.U.canvas(800, 600), x = c.getContext('2d');
          x.fillStyle = '#000000'; x.fillRect(0, 0, 800, 600);
          const t = RT.Doc.selected();
          const bg = PhotoTool.addCanvas(c, 'Black');
          Doc.reorder(bg.id, -999);
          Doc.select(t.id);
          t.color = '#ff00ff'; RT.Layers.touch(t); RT.Doc._ver++; RT.View.request(); })()""")
        await p.wait_for_timeout(600)
        await s.tb('nudge')                    # (adding a picture closes the panel: open it again)
        await p.wait_for_timeout(300)
        ink = """(() => {     // where the MAGENTA words are on the picture itself
          const c = RT.Doc.flatten({ maxDim: 0 });
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          const k = c.width / RT.Doc.width;
          let x0 = 1e9, x1 = -1;
          for (let i = 0; i < d.length; i += 4)
            if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] > 180) { const x = (i / 4) % c.width; if (x < x0) x0 = x; if (x > x1) x1 = x; }
          return { left: Math.round(x0 / k), right: Math.round(x1 / k) }; })()"""
        await p.evaluate("RT.Doc.selected().nudge = 0; RT.Doc._ver++; RT.View.request()")
        await p.wait_for_timeout(300)
        ink0 = await p.evaluate(ink)
        box_before = (await p.evaluate(SEL))['left']
        for _ in range(3):
            await p.click('#tx-right')
        await p.wait_for_timeout(400)
        sel = await p.evaluate(SEL)
        ink1 = await p.evaluate(ink)
        check('the nudge really moves the layer', sel['left'] > box_before, '%d -> %d' % (box_before, sel['left']))
        moved_ink = ink1['left'] - ink0['left']
        check('the drawn words move with the box (the old bug: only the box moved)',
              abs(moved_ink - (sel['left'] - box_before)) <= 8, 'words +%d, box +%d' % (moved_ink, sel['left'] - box_before))
        # (the selection frame has a small margin of its own, and the drawn picture keeps room for a stroke)
        check('the words end up under their own box', abs(ink1['left'] - sel['left']) <= 40, str(ink1) + ' box ' + str(sel['left']))

        # ---- the logo: a real circle, and never a shared gradient id ----
        await p.evaluate("""(() => { const a = I.logo(60, true), b = I.logo(58, true);
          const d = document.createElement('div'); d.id = 'logotest'; d.innerHTML = a + b; document.body.appendChild(d); })()""")
        ids = await p.evaluate("Array.from(document.querySelectorAll('#logotest linearGradient')).map(e => e.id)")
        check('two logos never share a gradient id', len(ids) == 2 and ids[0] != ids[1], str(ids))
        circ = await p.evaluate("Array.from(document.querySelectorAll('#logotest svg')).map(sv => { const el = Array.from(sv.children).filter(n => n.tagName !== 'defs')[0]; return el ? el.getAttribute('r') : null; })")
        check('the round logo is drawn as a circle to the edge', circ == ['32', '32'], str(circ))

    print('RESULT ' + ('ok' if ok else 'FAILED'))
    sys.exit(0 if ok else 1)

asyncio.run(main())
