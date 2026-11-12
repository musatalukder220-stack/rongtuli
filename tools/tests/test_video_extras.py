"""Stage 6, second part: the rest of the user's video.

  * Shape Mask has a "Tap to hide background" way (a shape window, or the colours kept and the rest covered);
  * a text layer has the video's Style menu (Color / Gradient / Texture), ready-made Style presets, and a Heart bubble;
  * an added picture has an Outline and a Style panel;
  * Fit can take the background colour from a tap on the photo;
  * the "Add" sheet holds Shape / Text / Sticker / Add Photo / Background.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

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

        # ---- Shape Mask, the new way ----
        await p.evaluate("ShapeMaskTool.open()")
        await p.wait_for_timeout(400)
        chips = await p.evaluate("Array.from(document.querySelectorAll('#panel .chip')).map(c => c.textContent.trim())")
        check('Shape Mask offers the shape way and "Tap to hide background"', 'Tap to hide background' in chips, str(chips[:3]))
        await p.evaluate("(() => { Array.from(document.querySelectorAll('#panel .chip')).find(c => c.textContent.trim() === 'Tap to hide background').click(); })()")
        await p.wait_for_timeout(700)
        check('choosing it builds a cover from the picture colours', await p.evaluate("!!(ShapeMaskTool.mem.sheet)") is True)
        await s.top('Apply'); await p.wait_for_timeout(1200)
        names = await p.evaluate("RT.Doc.layers.map(l => l.name)")
        check('a "Background hidden" layer is added', 'Background hidden' in names, str(names))

        # ---- a text layer: Style panel, presets, heart bubble ----
        await p.evaluate("TextTool.add({ bubble: { kind: 'heart', fill: '#ff4d6d', line: '#ffffff', lw: 4, tail: 'none' }, color: '#ffffff' })")
        await p.wait_for_selector('textarea.te-in', timeout=5000)
        await p.fill('textarea.te-in', 'Love')
        await p.evaluate("(() => { Array.from(document.querySelectorAll('.te-top button')).pop().click(); })()")
        await p.wait_for_timeout(600)
        ids = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => e.dataset.id)")
        check('a text layer offers Style presets and Style', 'presets' in ids and 'style' in ids, str(ids[:8]))
        await p.evaluate("(() => document.querySelector('#toolbar .tb-item[data-id=style]').click())()")
        await p.wait_for_timeout(300)
        # the Style menu from the owner's reference video: Color / Gradient / Texture, with gradient presets
        tabs = await p.evaluate("Array.from(document.querySelectorAll('#panel .grad-tabs .chip')).map(e => e.textContent.trim())")
        check('the Style panel has Color, Gradient and Texture tabs', tabs == ['Color', 'Gradient', 'Texture'], str(tabs))
        subs = await p.evaluate("Array.from(document.querySelectorAll('#panel .sub-h')).map(e => e.textContent)")
        check('the Color tab has a gradient-preset row', 'Gradient presets' in subs, str(subs))
        await p.evaluate("(() => document.querySelector('#panel .grad-sw').click())()")
        await p.wait_for_timeout(400)
        grad = await p.evaluate("(() => { const l = RT.Doc.layers.at(-1); return !!(l.grad && l.grad.stops && l.grad.stops.length === 2); })()")
        check('a preset fills the words with a gradient', grad is True)
        await p.evaluate("(() => Array.from(document.querySelectorAll('#panel .grad-tabs .chip')).find(c => c.textContent.trim() === 'Gradient').click())()")
        await p.wait_for_timeout(300)
        subs2 = await p.evaluate("Array.from(document.querySelectorAll('#panel .sub-h')).map(e => e.textContent)")
        ang = await p.evaluate("Array.from(document.querySelectorAll('#panel .chip')).map(e => e.textContent.trim())")
        check('the Gradient tab has From / To and an angle', subs2[:2] == ['From', 'To'] and 'Radial' in ang, str(subs2) + str(ang[-4:]))
        await p.evaluate("(() => Array.from(document.querySelectorAll('#panel .grad-tabs .chip')).find(c => c.textContent.trim() === 'Texture').click())()")
        await p.wait_for_timeout(300)
        tex = await p.evaluate("Array.from(document.querySelectorAll('#panel button')).map(e => e.textContent.trim())")
        check('the Texture tab offers a picture inside the words', 'Choose a picture' in tex, str(tex))
        await s.shot('s6_text_style')
        kinds = await p.evaluate("RT.Doc.layers[RT.Doc.layers.length - 1].bubble && RT.Doc.layers[RT.Doc.layers.length - 1].bubble.kind")
        check('the heart bubble is used', kinds == 'heart', str(kinds))
        await p.evaluate("(() => document.querySelector('#toolbar .tb-item[data-id=bubble]').click())()")
        await p.wait_for_timeout(300)
        bchips = await p.evaluate("Array.from(document.querySelectorAll('#panel .chip')).map(c => c.textContent.trim())")
        check('the Bubble panel also has Heart', 'Heart' in bchips, str(bchips))

        # ---- an added picture: Outline ----
        await p.evaluate("""(() => { const c = RT.U.canvas(120, 90), x = c.getContext('2d'); x.fillStyle = '#2b6cb0'; x.fillRect(0, 0, 120, 90);
          const l = PhotoTool.addCanvas(c, 'Card'); RT.Doc.select(l.id); RT.History.commit(); })()""")
        await p.wait_for_timeout(400)
        ids2 = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => e.dataset.id)")
        check('an added picture offers Outline and Style', 'imgoutline' in ids2 and 'style' in ids2, str(ids2[:14]))
        await p.evaluate("""(() => { const l = RT.Doc.selected() || RT.Doc.layers[RT.Doc.layers.length-1];
          l.outline = { color: '#ffcc00', width: 8 }; RT.View.request(); RT.History.commit(); })()""")
        await p.wait_for_timeout(300)
        check('the outline is kept on the layer', await p.evaluate("RT.Doc.layers[RT.Doc.layers.length-1].outline.width") == 8)

        # ---- Fit: background colour from a tap ----
        await p.evaluate("FitTool.open()")
        await p.wait_for_timeout(400)
        await p.evaluate("(() => { Array.from(document.querySelectorAll('#panel .chip')).find(c => c.textContent.trim() === 'Tap a colour').click(); })()")
        await p.wait_for_timeout(200)
        r = await p.evaluate("(() => { const c = RT.View.canvas.getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2]; })()")
        await p.mouse.click(r[0], r[1])
        await p.wait_for_timeout(300)
        check('a tap sets the fill colour', await p.evaluate("FitTool.mem.bg === 'color' && /^#[0-9a-f]{6}$/.test(FitTool.mem.color)"), await p.evaluate("FitTool.mem.color"))
        await s.top('Cancel'); await p.wait_for_timeout(300)

        # ---- the Add sheet ----
        await p.evaluate("RT.Doc.select(null)")
        await p.wait_for_timeout(200)
        await p.evaluate("UI.addSheet()")
        await p.wait_for_timeout(400)
        items = await p.evaluate("Array.from(document.querySelectorAll('.apps-grid .apps-cell small')).map(e => e.textContent)")
        for want in ('Shape', 'Text', 'Sticker', 'Add Photo', 'Background'):
            check('the Add sheet has ' + want, want in items, str(items))
        # every cell must carry a picture (no blank / white squares)
        drawn = await p.evaluate("Array.from(document.querySelectorAll('.apps-grid .apps-cell')).map(c => (c.querySelector('.ic svg') ? 1 : 0))")
        check('every cell in the Add sheet has its icon', all(drawn) and len(drawn) == 8, str(drawn))
        await s.shot('s6_add_icons2')

        # ---- Shape = a crop of the picture (not a coloured layer) ----
        await p.evaluate("(() => { const b = document.querySelector('.sheet-h button'); if (b) b.click(); })()")   # close the Add sheet
        await p.wait_for_timeout(400)
        await p.evaluate("""(() => { const c = RT.U.canvas(400, 300), x = c.getContext('2d');
          x.fillStyle = '#2b6cb0'; x.fillRect(0, 0, 400, 300);
          const l = PhotoTool.addCanvas(c, 'Card'); RT.Doc.select(l.id); RT.History.commit(); })()""")
        await p.wait_for_timeout(300)
        n_before = await p.evaluate("RT.Doc.layers.length")
        await p.evaluate("ShapeTool.open(RT.Doc.layers.at(-1))")
        await p.wait_for_selector('.shp-groups .chip', timeout=6000)
        groups = await p.evaluate("Array.from(document.querySelectorAll('.shp-groups .chip')).map(c => c.textContent.trim())")
        check('the shapes are grouped', len(groups) >= 3, str(groups))
        basic = await p.evaluate("Array.from(document.querySelectorAll('.shp-pick .shp-cell')).map(c => c.dataset.id)")
        await p.evaluate("(() => document.querySelector('.shp-groups .chip[data-v=\"love\"]').click())()")
        await p.wait_for_timeout(250)
        love = await p.evaluate("Array.from(document.querySelectorAll('.shp-pick .shp-cell')).map(c => c.dataset.id)")
        check('each group shows its own shapes', 'heart' in love and 'heart' not in basic, str(love))
        await p.evaluate("(() => document.querySelector('.shp-groups .chip[data-v=\"basic\"]').click())()")
        await p.wait_for_timeout(250)
        await p.click('.shp-pick .shp-cell[data-id="circle"]')
        await p.wait_for_function("RT.UI.mode() && RT.UI.mode().title === 'Shape Crop'", timeout=8000)
        await s.top('Apply')
        await p.wait_for_timeout(1200)
        check('a shape cuts the picture, it adds no layer', await p.evaluate("RT.Doc.layers.length") == n_before)
        cut = await p.evaluate("""(() => { const l = RT.Doc.layers.at(-1), d = l.bitmap.getContext('2d');
          const c = d.getImageData(0, 0, l.bitmap.width, l.bitmap.height).data;
          let clear = 0; for (let i = 3; i < c.length; i += 4) if (c[i] < 20) clear++;
          return { w: l.bitmap.width, h: l.bitmap.height, clear: clear / (c.length / 4), corner: Array.from(d.getImageData(2, 2, 1, 1).data)[3] }; })()""")
        check('the result is a round cut-out', cut['corner'] < 20 and 0.1 < cut['clear'] < 0.35, str(cut))
        check('it is roughly square', abs(cut['w'] - cut['h']) <= 4, '%dx%d' % (cut['w'], cut['h']))
        await s.shot('s6_add')

        s.report()
    return ok

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
