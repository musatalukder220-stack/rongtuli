"""Frame, Border, Fit, Shape Mask, Mask, Lens Flare, Callout – and picking through the see-through parts of a layer."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

TOP = """(() => { const l = RT.Doc.layers[RT.Doc.layers.length - 1], c = l.bitmap ? l.bitmap.getContext('2d') : null;
  const px = (fx, fy) => c ? c.getImageData(Math.floor(l.bitmap.width * fx), Math.floor(l.bitmap.height * fy), 1, 1).data[3] : -1;
  return {name: l.name, type: l.type, blend: l.blend, op: l.opacity, w: l.bitmap ? l.bitmap.width : 0, h: l.bitmap ? l.bitmap.height : 0, sx: +l.scaleX.toFixed(3),
          edge: px(0.5, 0.004), mid: px(0.5, 0.5), corner: px(0.004, 0.004), sel: RT.Doc.selectedId === l.id, bubble: l.bubble || null}; })()"""
DOC = "(() => ({W: RT.Doc.width, H: RT.Doc.height, n: RT.Doc.layers.length, names: RT.Doc.layers.map(l => l.name + (l.base ? '*' : '')), bg: RT.Doc.bg.type}))()"
MODE = "RT.UI.mode() ? RT.UI.mode().title : null"
# screen position of a point of the canvas (document px)
AT = "([x, y]) => { const p = RT.View.toView(x, y), r = RT.View.canvas.getBoundingClientRect(); return [p[0] + r.left, p[1] + r.top]; }"

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open('?demo')
        maxdim = await p.evaluate("MAX_DIM")

        # ---- Frame ----
        await s.tb('frame'); await p.wait_for_timeout(300)
        check('frame mode', await p.evaluate(MODE) == 'Frame')
        await p.click('.fx-it[data-id="film"]'); await p.wait_for_timeout(200)
        await s.shot('b1_frame_film')
        await p.click('.fx-it[data-id="polaroid"]'); await p.wait_for_timeout(200)
        await s.top('Apply'); await p.wait_for_timeout(400)
        t = await p.evaluate(TOP)
        check('a frame layer covers the canvas: border filled, middle open', t['name'] == 'Frame' and (t['w'], t['h']) == (1600, 1200) and t['edge'] == 255 and t['mid'] == 0 and t['sel'], str(t))
        # a tap in the open middle goes through the frame (nothing else is there: the selection is dropped)
        c = await p.evaluate(AT, [800, 600]); await p.mouse.click(c[0], c[1]); await p.wait_for_timeout(250)
        check('a tap in the open middle does not hit the frame', await p.evaluate("RT.Doc.selectedId") is None)
        e = await p.evaluate(AT, [800, 20]); await p.mouse.click(e[0], e[1]); await p.wait_for_timeout(250)
        check('a tap on its border picks the frame', (await p.evaluate(TOP))['sel'])
        await p.evaluate("RT.Doc.select(null)")

        # ---- Border (around the picture: the canvas grows) ----
        await s.tb('border'); await p.wait_for_timeout(300)
        await p.click('#panel .sw[data-c="#000000"]'); await p.wait_for_timeout(150)
        await s.shot('b2_border')
        await s.top('Apply'); await p.wait_for_timeout(400)
        d = await p.evaluate(DOC); t = await p.evaluate(TOP)
        k = min(1, maxdim / 1720)
        check('the canvas grew by the border', abs(d['W'] - round(1720 * k)) <= 1 and abs(d['H'] - round(1320 * k)) <= 1 and t['name'] == 'Border' and t['edge'] == 255 and t['mid'] == 0, '%s %s' % (d, t))
        await p.evaluate("RT.Doc.select(null)")
        W1, H1 = d['W'], d['H']

        # ---- Fit (square, blurred background) ----
        await s.tb('fit'); await p.wait_for_timeout(400)
        await s.shot('b3_fit')
        await s.top('Apply'); await p.wait_for_timeout(900)
        d = await p.evaluate(DOC)
        side = max(W1, H1)
        check('square canvas with a new blurred background, the old photo is an ordinary layer now', d['W'] == d['H'] == side and d['names'][0] == 'Background*' and d['names'][1] == 'Photo' and d['n'] == 4, str(d))
        base = await p.evaluate("(() => { const b = RT.Doc.layers[0].bitmap; return [b.width, b.height, b.getContext('2d').getImageData(5, 5, 1, 1).data[3]]; })()")
        check('the background fills the canvas', base == [side, side, 255], str(base))

        # ---- Shape Mask ----
        await s.tb('shapemask'); await p.wait_for_timeout(300)
        await p.click('#panel .shp-it[data-id="star"]'); await p.wait_for_timeout(150)
        a = await p.evaluate(AT, [side / 2, side / 2]); b = await p.evaluate(AT, [side / 2 + 120, side / 2])
        await s.drag(a[0], a[1], b[0], b[1]); await p.wait_for_timeout(200)
        await s.shot('b4_shapemask')
        await s.top('Apply'); await p.wait_for_timeout(400)
        t = await p.evaluate(TOP)
        moved = await p.evaluate("(() => { const l = RT.Doc.layers[RT.Doc.layers.length - 1], c = l.bitmap.getContext('2d'), W = l.bitmap.width; return [c.getImageData(W / 2 + 120, W / 2, 1, 1).data[3], c.getImageData(W / 2 - 330, W / 2, 1, 1).data[3]]; })()")
        check('a sheet with a star window, moved by dragging', t['name'] == 'Shape mask' and t['corner'] == 255 and moved[0] == 0, '%s %s' % (t, moved))
        await p.evaluate("RT.History.undo(); RT.Doc.select(null)"); await p.wait_for_timeout(200)

        # ---- Mask ----
        await s.tb('mask'); await p.wait_for_timeout(300)
        await p.click('.fx-it[data-id="bokeh1"]'); await p.wait_for_timeout(250)
        await s.shot('b5_mask')
        await s.top('Apply'); await p.wait_for_timeout(400)
        t = await p.evaluate(TOP)
        check('a light overlay is added with its blend', t['name'] == 'Mask' and t['blend'] == 'screen' and abs(t['op'] - 1) < 0.01 and t['sel'], str(t))
        await p.evaluate("RT.Doc.select(null)")

        # ---- Lens Flare ----
        await s.tb('lensflare'); await p.wait_for_selector('.flare-cell'); await p.wait_for_timeout(200)
        await s.shot('b6_flare_sheet')
        await p.click('.flare-cell[data-id="classic"]'); await p.wait_for_timeout(300)
        t = await p.evaluate(TOP)
        check('a flare is added like a sticker, blended as light', t['name'] == 'Lens flare' and t['blend'] == 'screen' and t['sel'] and t['corner'] == 0, str(t))
        await p.evaluate("RT.Doc.select(null)")

        # ---- Callout ----
        await s.tb('callout'); await p.wait_for_selector('.flare-cell'); await p.wait_for_timeout(200)
        await s.shot('b7_callout_sheet')
        await p.click('.flare-cell[data-id="oval"]'); await p.wait_for_selector('.te-in')
        await p.fill('.te-in', 'Hello there!'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(400)
        t = await p.evaluate(TOP)
        check('a text with an oval bubble', t['type'] == 'text' and t['bubble'] and t['bubble']['kind'] == 'oval' and t['sel'], str(t))
        white = await p.evaluate("""(() => { const l = RT.Doc.selected(), r = RT.TextRender.ensure(l), k = r.canvas.width / (r.w + 2 * r.M);
            return Array.from(r.canvas.getContext('2d').getImageData(Math.round((r.M + r.w * 0.5) * k), Math.round((r.M + r.h * 0.12) * k), 1, 1).data); })()""")
        check('the bubble is drawn behind the words', white[:3] == [255, 255, 255] and white[3] == 255, str(white))
        await s.tb('bubble'); await p.wait_for_timeout(200); await p.click('#panel .chip[data-v="cloud"]'); await p.wait_for_timeout(200)
        await p.click('#panel .chip[data-v="right"]'); await p.wait_for_timeout(200)
        t = await p.evaluate(TOP)
        check('the bubble can be changed afterwards', t['bubble']['kind'] == 'cloud' and t['bubble']['tail'] == 'right', str(t['bubble']))
        await s.shot('b8_callout')

        # ---- everything survives being saved as a project ----
        back = await p.evaluate("""(async () => {
            const pk = await RT.Project.pack({name: 'decor'}); const d = await RT.Project.read(RT.Zip.open(await pk.blob.arrayBuffer()));
            return d.layers.map(l => l.name + '|' + l.blend + '|' + (l.bubble ? l.bubble.kind : '') + '|' + (l.shape ? l.shape.id : '')); })()""")
        check('project file keeps blends and the bubble', any(x.startswith('Mask|screen') for x in back) and any('|cloud|' in x for x in back), str(back))
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
