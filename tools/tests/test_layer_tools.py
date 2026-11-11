"""Tools for ONE picture: Crop / Shape Crop / Remove BG / Eraser / Cutout of an added photo, and the Shape tool."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

# a blue card with a red disc in the middle, as an added photo
ADD = """(() => { const c = RT.U.canvas(600, 400), x = c.getContext('2d'); x.fillStyle = '#2b6cb0'; x.fillRect(0, 0, 600, 400);
  x.fillStyle = '#e11d48'; x.beginPath(); x.arc(300, 200, 120, 0, 7); x.fill();
  const l = PhotoTool.addCanvas(c, 'Card'); return [l.x, l.y, l.scaleX]; })()"""
SEL = "(() => { const l = RT.Doc.selected(); return l ? {w: l.bitmap.width, h: l.bitmap.height, x: l.x, y: l.y, s: l.scaleX, shape: l.shape || null} : null; })()"
# screen position of a pixel of the picture that is open in a "bench" tool
AT = """([w, h, x, y]) => { const D = RT.Doc, k = Math.min(D.width / w, D.height / h), ox = (D.width - w * k) / 2, oy = (D.height - h * k) / 2;
  const p = RT.View.toView(ox + x * k, oy + y * k), r = RT.View.canvas.getBoundingClientRect(); return [p[0] + r.left, p[1] + r.top]; }"""
PIX = """([x, y]) => { const l = RT.Doc.selected() || RT.Doc.layers[0]; return Array.from(l.bitmap.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data); }"""
MODE = "RT.UI.mode() ? RT.UI.mode().title : null"

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open('?demo')
        x0, y0, sc = await p.evaluate(ADD)
        await p.wait_for_timeout(300)
        ids = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => e.dataset.id)")
        check('an added photo offers Crop, Shape Crop, Remove BG, Cutout, Eraser', all(i in ids for i in ['crop', 'shapecrop', 'removebg', 'cutout', 'eraser']), str(ids[:9]))

        # ---- Crop ----
        await s.tb('crop'); await p.wait_for_timeout(300)
        check('crop mode opens', await p.evaluate(MODE) == 'Crop photo')
        a = await p.evaluate(AT, [600, 400, 0, 0]); b = await p.evaluate(AT, [600, 400, 150, 100])
        await s.drag(a[0] + 2, a[1] + 2, b[0], b[1]); await p.wait_for_timeout(200)
        await s.shot('a1_layer_crop')
        await s.top('Apply'); await p.wait_for_timeout(400)
        st = await p.evaluate(SEL)
        check('cropped to about 450 × 300', abs(st['w'] - 450) <= 4 and abs(st['h'] - 300) <= 4, '%dx%d' % (st['w'], st['h']))
        dx, dy = st['x'] - x0, st['y'] - y0
        check('what is left stays in place', abs(dx - 75 * sc) < 5 and abs(dy - 50 * sc) < 5, 'moved %.1f, %.1f (expected %.1f, %.1f)' % (dx, dy, 75 * sc, 50 * sc))
        px = await p.evaluate(PIX, [150, 100])
        check('the disc is still where it was in the picture', px[0] > 200 and px[2] < 110, str(px))

        # ---- Shape Crop ----
        await s.tb('shapecrop'); await p.wait_for_timeout(300)
        check('shape crop opens', await p.evaluate(MODE) == 'Shape Crop')
        await p.click('#panel .shp-groups .chip[data-v="many"]'); await p.wait_for_timeout(150)
        await p.click('#panel .shp-cell[data-id="star"]'); await p.wait_for_timeout(150)
        await s.shot('a2_shape_crop_star')
        await p.click('#panel .shp-groups .chip[data-v="basic"]'); await p.wait_for_timeout(150)
        await p.click('#panel .shp-cell[data-id="circle"]'); await p.wait_for_timeout(150)
        await s.top('Apply'); await p.wait_for_timeout(400)
        st = await p.evaluate(SEL)
        c0 = await p.evaluate(PIX, [2, 2]); c1 = await p.evaluate(PIX, [st['w'] / 2, st['h'] / 2])
        check('circle: square picture, clear corners, full middle', abs(st['w'] - st['h']) <= 2 and abs(st['w'] - 270) <= 4 and c0[3] == 0 and c1[3] == 255, '%dx%d corner %s middle %s' % (st['w'], st['h'], c0, c1))
        await s.top('Undo'); await p.wait_for_timeout(200); await s.top('Undo'); await p.wait_for_timeout(300)
        st = await p.evaluate(SEL)
        check('undo twice brings the whole card back', st and (st['w'], st['h']) == (600, 400) and abs(st['x'] - x0) < 0.5, str(st))

        # ---- Remove BG (Auto) ----
        await s.tb('removebg')
        await p.wait_for_function("RT.UI.mode() && RT.UI.mode().title === 'Cutout' && !document.querySelector('#busy.show')", timeout=15000)
        await p.wait_for_timeout(500)
        await s.shot('a3_remove_bg')
        check('undo is offered after Auto', not await p.locator('#topbar button[title="Undo"]').is_disabled())
        await s.top('Apply'); await p.wait_for_timeout(600)
        st = await p.evaluate(SEL)
        mid = await p.evaluate(PIX, [st['w'] / 2, st['h'] / 2]); cor = await p.evaluate(PIX, [1, 1])
        check('only the disc is left (about 240 px)', 232 <= st['w'] <= 250 and 232 <= st['h'] <= 250 and mid[0] > 200 and mid[3] == 255 and cor[3] == 0, '%dx%d middle %s corner %s' % (st['w'], st['h'], mid, cor))
        check('the disc did not move', abs(st['x'] - x0) < 2.5 and abs(st['y'] - y0) < 2.5, '%.1f, %.1f' % (st['x'] - x0, st['y'] - y0))
        W, H = st['w'], st['h']

        # ---- Eraser, with undo / redo inside the tool ----
        await s.tb('eraser'); await p.wait_for_timeout(400)
        a = await p.evaluate(AT, [W, H, 4, H / 2]); b = await p.evaluate(AT, [W, H, W - 4, H / 2])
        await s.drag(a[0], a[1], b[0], b[1], 16); await p.wait_for_timeout(300)
        await s.shot('a4_eraser')
        await s.top('Undo'); await p.wait_for_timeout(200)
        check('stroke undone inside the tool', await p.locator('#topbar button[title="Undo"]').is_disabled() and not await p.locator('#topbar button[title="Redo"]').is_disabled())
        await s.top('Redo'); await p.wait_for_timeout(200)
        await s.top('Apply'); await p.wait_for_timeout(600)
        st = await p.evaluate(SEL)
        mid = await p.evaluate(PIX, [st['w'] / 2, st['h'] / 2]); top = await p.evaluate(PIX, [st['w'] / 2, st['h'] * 0.2])
        check('a band is rubbed out of the middle, the rest stays', mid[3] < 30 and top[3] == 255, 'middle %s upper %s' % (mid, top))

        # ---- Cutout of the background photo: draw around the middle ----
        await p.evaluate("RT.Doc.select(null)"); await p.wait_for_timeout(200)
        await s.tb('cutout'); await p.wait_for_timeout(400)
        check('cutout opens on the background photo', await p.evaluate(MODE) == 'Cutout')
        pts = [(400, 300), (1200, 300), (1200, 900), (400, 900), (400, 300)]
        scr = [await p.evaluate(AT, [1600, 1200, x, y]) for x, y in pts]
        m = p.mouse
        await m.move(scr[0][0], scr[0][1]); await m.down()
        for i in range(1, len(scr)):
            for k in range(1, 9): await m.move(scr[i - 1][0] + (scr[i][0] - scr[i - 1][0]) * k / 8, scr[i - 1][1] + (scr[i][1] - scr[i - 1][1]) * k / 8)
        await m.up(); await p.wait_for_timeout(300)
        await s.shot('a5_cutout_around')
        await s.top('Apply'); await p.wait_for_timeout(700)
        base = await p.evaluate("(() => { const l = RT.Doc.layers[0], x = l.bitmap.getContext('2d'); return {w: l.bitmap.width, h: l.bitmap.height, base: l.base, out: x.getImageData(100, 100, 1, 1).data[3], inside: x.getImageData(800, 600, 1, 1).data[3], clear: RT.Doc.hasTransparency()}; })()")
        check('outside is see-through, inside kept, size unchanged', base == {'w': 1600, 'h': 1200, 'base': True, 'out': 0, 'inside': 255, 'clear': True}, str(base))

        # ---- Shape Crop of the whole picture (Tools grid) ----
        await p.evaluate("RT.Doc.select(null)"); await p.wait_for_timeout(200)
        await s.tb('tools'); await p.wait_for_timeout(200); await p.click('.tool-cell[data-id="shapecrop"]'); await p.wait_for_timeout(400)
        await p.click('#panel .shp-groups .chip[data-v="basic"]'); await p.wait_for_timeout(150); await p.click('#panel .shp-cell[data-id="circle"]'); await p.wait_for_timeout(150)
        await s.top('Apply'); await p.wait_for_timeout(600)
        d = await p.evaluate("(() => { const l = RT.Doc.layers[0]; return {W: RT.Doc.width, H: RT.Doc.height, bw: l.bitmap.width, corner: l.bitmap.getContext('2d').getImageData(3, 3, 1, 1).data[3]}; })()")
        check('the canvas is cut to the circle', d['W'] == d['H'] == d['bw'] and abs(d['W'] - 1080) <= 4 and d['corner'] == 0, str(d))
        await s.shot('a7_shape_crop_canvas')
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
