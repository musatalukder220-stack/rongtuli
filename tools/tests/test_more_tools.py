"""Brushes, Retouch, Clone, Enhance, Tilt Shift, Perspective, Motion, Selection, Stretch, Dispersion, Replay."""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

AT = "([x, y]) => { const p = RT.View.toView(x, y), r = RT.View.canvas.getBoundingClientRect(); return [p[0] + r.left, p[1] + r.top]; }"
MODE = "RT.UI.mode() ? RT.UI.mode().title : null"
# mean colour of a square of the background photo: [r, g, b, a]
MEAN = """([x, y, s]) => { const b = RT.Doc.layers[0].bitmap, d = b.getContext('2d').getImageData(x - s / 2, y - s / 2, s, s).data; let q = [0, 0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 4; c++) q[c] += d[i + c]; return q.map(v => Math.round(v / (d.length / 4) * 10) / 10); }"""
# how busy a square is (mean difference between neighbours): drops when it is blurred
DETAIL = """([x, y, s]) => { const b = RT.Doc.layers[0].bitmap, d = b.getContext('2d').getImageData(x - s / 2, y - s / 2, s, s).data; let t = 0, n = 0;
  for (let j = 0; j < s; j++) for (let i = 0; i < s - 1; i++) { const k = (j * s + i) * 4; t += Math.abs(d[k] - d[k + 4]) + Math.abs(d[k + 1] - d[k + 5]) + Math.abs(d[k + 2] - d[k + 6]); n++; } return t / n; }"""
SET = """([label, v]) => { const sl = Array.from(document.querySelectorAll('#panel .sl')).find(e => e.querySelector('.sl-l') && e.querySelector('.sl-l').textContent === label);
  const i = sl.querySelector('input'); i.value = v; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); return +i.value; }"""
BASE = "(() => { const l = RT.Doc.layers[0]; return [l.bitmap.width, l.bitmap.height, RT.Doc.width, RT.Doc.height, RT.Doc.layers.length, RT.History.idx]; })()"
# a photo with fine detail everywhere (so blur and movement can be measured)
NOISY = """(() => { const c = RT.U.canvas(1200, 900), x = c.getContext('2d'), R = RT.U.rng(3);
  for (let j = 0; j < 90; j++) for (let i = 0; i < 120; i++) { x.fillStyle = 'rgb(' + Math.floor(R() * 255) + ',' + Math.floor(R() * 255) + ',' + Math.floor(R() * 255) + ')'; x.fillRect(i * 10, j * 10, 10, 10); }
  x.fillStyle = '#ffffff'; x.fillRect(100, 100, 120, 120); x.fillStyle = '#00d000'; x.fillRect(800, 600, 160, 160);
  RT.UI.openCanvas(c); })()"""

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        async def drag_doc(pts, steps=10, hold=0):
            scr = [await p.evaluate(AT, list(q)) for q in pts]
            m = p.mouse
            await m.move(scr[0][0], scr[0][1]); await m.down()
            if hold: await p.wait_for_timeout(hold)
            for i in range(1, len(scr)):
                for k in range(1, steps + 1): await m.move(scr[i - 1][0] + (scr[i][0] - scr[i - 1][0]) * k / steps, scr[i - 1][1] + (scr[i][1] - scr[i - 1][1]) * k / steps)
            await m.up(); await p.wait_for_timeout(250)
        async def tool(id_):
            await s.tb('tools'); await p.wait_for_timeout(200); await p.click('.tool-cell[data-id="%s"]' % id_); await p.wait_for_timeout(450)
        async def apply():
            await s.top('Apply'); await p.wait_for_function("!RT.UI.mode() && !document.querySelector('#busy.show')", timeout=20000); await p.wait_for_timeout(250)

        await s.open()
        await p.evaluate(NOISY); await p.wait_for_timeout(400)
        soon = await p.evaluate("(() => { document.querySelector('#toolbar .tb-item[data-id=tools]').click(); const a = document.querySelectorAll('#toolbar .tb-item.soon').length, b = document.querySelectorAll('.tool-cell.soon').length; document.querySelector('#toolbar .tb-item[data-id=tools]').click(); return [a, b]; })()")
        check('nothing is marked SOON any more', soon == [0, 0], str(soon))

        # ---- Brushes ----
        await s.tb('brushes'); await p.wait_for_timeout(300)
        check('brushes mode', await p.evaluate(MODE) == 'Brushes')
        await drag_doc([(200, 450), (1000, 450)])
        await s.tb('hearts'); await drag_doc([(200, 250), (1000, 250)])
        await s.tb('rainbow'); await drag_doc([(200, 650), (600, 760), (1000, 650)])
        await s.tb('confetti'); await drag_doc([(300, 800), (900, 820)])
        await s.shot('c1_brushes')
        await s.top('Undo'); await p.wait_for_timeout(150); await s.top('Redo'); await p.wait_for_timeout(150)
        await apply()
        top = await p.evaluate("(() => { const l = RT.Doc.layers[RT.Doc.layers.length - 1]; return [l.name, l.bitmap.width > 700, l.bitmap.height > 400, RT.Doc.layers.length]; })()")
        check('the strokes become one new layer', top == ['Brush', True, True, 2], str(top))
        await p.evaluate("RT.History.undo()"); await p.wait_for_timeout(200)

        # ---- Retouch: smooth one part, brighten another ----
        await s.tb('retouch'); await p.wait_for_timeout(300)
        d0 = await p.evaluate(DETAIL, [600, 300, 60]); far0 = await p.evaluate(MEAN, [1100, 800, 40]); b0 = await p.evaluate(MEAN, [600, 600, 40])
        await p.evaluate(SET, ['Size', 120]); await p.evaluate(SET, ['Strength', 100])
        await drag_doc([(500, 300), (700, 300)])
        await s.tb('brighten'); await drag_doc([(500, 600), (700, 600)])
        await s.shot('c2_retouch')
        await apply()
        d1 = await p.evaluate(DETAIL, [600, 300, 60]); far1 = await p.evaluate(MEAN, [1100, 800, 40]); b1 = await p.evaluate(MEAN, [600, 600, 40])
        check('smooth: the rubbed part lost its grain', d1 < d0 * 0.75, '%.1f -> %.1f' % (d0, d1))
        check('brighten: the rubbed part is lighter', sum(b1[:3]) > sum(b0[:3]) + 25, '%s -> %s' % (b0, b1))
        check('the rest of the photo is untouched', far0 == far1, '%s %s' % (far0, far1))

        # ---- Clone: copy the green square onto another place ----
        await tool('clone')
        check('clone mode', await p.evaluate(MODE) == 'Clone')
        await p.evaluate(SET, ['Size', 90]); await p.evaluate(SET, ['Soft edge', 0])
        g = await p.evaluate(AT, [880, 680]); await p.mouse.click(g[0], g[1]); await p.wait_for_timeout(250)          # source: middle of the green square
        await drag_doc([(300, 600), (310, 600)])
        await s.shot('c3_clone')
        await apply()
        m1 = await p.evaluate(MEAN, [300, 600, 20])
        check('the green square was copied to the new place', m1[1] > 190 and m1[0] < 40 and m1[2] < 40, str(m1))

        # ---- Enhance ----
        await tool('enhance')
        e0 = await p.evaluate(MEAN, [400, 400, 200])
        await apply()
        e1 = await p.evaluate(MEAN, [400, 400, 200])
        check('enhance changes the photo', e0 != e1, '%s -> %s' % (e0, e1))

        # ---- Tilt Shift: the middle band stays sharp, top and bottom blur ----
        await tool('tiltshift')
        t0 = (await p.evaluate(DETAIL, [600, 60, 60]), await p.evaluate(DETAIL, [1000, 450, 60]))
        await p.evaluate(SET, ['Blur', 80]); await p.wait_for_timeout(300)
        await s.shot('c4_tiltshift')
        await apply()
        t1 = (await p.evaluate(DETAIL, [600, 60, 60]), await p.evaluate(DETAIL, [1000, 450, 60]))
        check('tilt shift: edge blurred, middle sharp', t1[0] < t0[0] * 0.5 and t1[1] > t0[1] * 0.9, '%s -> %s' % (t0, t1))

        # ---- Perspective ----
        await tool('perspective')
        await p.evaluate(SET, ['Up / down', 80]); await p.wait_for_timeout(300)
        await s.shot('c5_perspective')
        await apply()
        c0 = await p.evaluate(MEAN, [20, 20, 20]); c1 = await p.evaluate(MEAN, [600, 450, 20])
        check('perspective: the top corners are empty now', c0[3] == 0 and c1[3] == 255, '%s %s' % (c0, c1))
        await p.evaluate("RT.History.undo()"); await p.wait_for_timeout(200)

        # ---- Motion: blur of the photo, and a trail behind a cut-out ----
        await tool('motion')
        mo0 = await p.evaluate(MEAN, [770, 680, 30])
        await apply()
        mo1 = await p.evaluate(MEAN, [770, 680, 30])
        check('motion smears a whole photo sideways (green runs to the left)', (mo1[1] - mo1[0]) > (mo0[1] - mo0[0]) + 15 and (await p.evaluate(BASE))[:2] == [1200, 900], '%s -> %s' % (mo0, mo1))
        disc = await p.evaluate("""(() => { const c = RT.U.canvas(200, 200), x = c.getContext('2d'); x.fillStyle = '#ff0000'; x.beginPath(); x.arc(100, 100, 90, 0, 7); x.fill();
            const l = PhotoTool.addCanvas(c, 'Disc'); return [l.x, l.y, l.scaleX]; })()""")
        await p.wait_for_timeout(250)
        await s.tb('moretools'); await p.wait_for_selector('.tools-grid .tool-cell'); await p.click('.tools-grid .tool-cell[data-id="motion"]'); await p.wait_for_timeout(450)      # the tools of an added photo
        await p.evaluate(SET, ['Direction', 180]); await p.evaluate(SET, ['Length', 60]); await p.wait_for_timeout(300)
        await s.shot('c6_motion')
        await apply()
        l2 = await p.evaluate("(() => { const l = RT.Doc.selected(), x = l.bitmap.getContext('2d'); return {w: l.bitmap.width, h: l.bitmap.height, x: l.x, right: Array.from(x.getImageData(l.bitmap.width - 100, 100, 1, 1).data), left: x.getImageData(40, 100, 1, 1).data[3]}; })()")
        check('the cut-out gets a trail to the left and stays in place', l2['w'] > 250 and l2['h'] == 200 and l2['right'] == [255, 0, 0, 255] and 0 < l2['left'] < 255 and abs((l2['x'] + (l2['w'] / 2 - 100) * disc[2]) - disc[0]) < 2, str(l2))
        await p.evaluate("RT.Doc.remove(RT.Doc.selectedId); RT.History.commit()"); await p.wait_for_timeout(200)

        # ---- Selection ----
        await tool('selection')
        await drag_doc([(300, 200), (700, 500)])
        await s.shot('c7_selection')
        await p.click('#panel [data-act="copy"]'); await p.wait_for_timeout(400)
        cp = await p.evaluate("(() => { const l = RT.Doc.selected(); return l ? [l.name, l.bitmap.width, l.bitmap.height, Math.round(l.x), Math.round(l.y), RT.UI.mode() ? 1 : 0] : null; })()")
        check('copy: the marked box is a new layer in the same place', cp and cp[0] == 'Copy' and abs(cp[1] - 400) <= 6 and abs(cp[2] - 300) <= 6 and abs(cp[3] - 500) <= 3 and abs(cp[4] - 350) <= 3 and cp[5] == 0, str(cp))
        await p.evaluate("RT.Doc.remove(RT.Doc.selectedId); RT.History.commit()"); await p.wait_for_timeout(200)
        await tool('selection'); await p.click('#panel .chip[data-v="oval"]')
        await drag_doc([(800, 100), (1100, 300)])
        await p.click('#panel [data-act="cut"]'); await p.wait_for_timeout(400)
        hole = await p.evaluate(MEAN, [950, 200, 20]); edge = await p.evaluate(MEAN, [806, 106, 6])
        check('cut: an oval hole is left in the photo', hole[3] == 0 and edge[3] == 255, '%s %s' % (hole, edge))
        await p.evaluate("RT.Doc.select(null)"); await p.wait_for_timeout(150)
        await tool('selection'); await p.click('#panel .chip[data-v="rect"]')
        await drag_doc([(100, 100), (1100, 800)])
        await p.click('#panel [data-act="crop"]'); await p.wait_for_timeout(400)
        b = await p.evaluate(BASE)
        check('crop: the canvas is cut to the box', abs(b[2] - 1000) <= 3 and abs(b[3] - 700) <= 3 and b[0] == b[2], str(b))

        # ---- Stretch ----
        await tool('stretch')
        s0 = await p.evaluate(MEAN, [500, 350, 60]); sf0 = await p.evaluate(MEAN, [900, 600, 40])
        await p.evaluate(SET, ['Size', 150])
        await drag_doc([(400, 350), (600, 350)], 14)
        await s.tb('swirlR'); await drag_doc([(300, 550), (301, 550)], 2, hold=500)
        await s.shot('c8_stretch')
        await s.top('Undo'); await p.wait_for_timeout(200); await s.top('Redo'); await p.wait_for_timeout(200)
        await apply()
        s1 = await p.evaluate(MEAN, [500, 350, 60]); sf1 = await p.evaluate(MEAN, [900, 600, 40])
        check('stretch moves the picture where it was pushed, not elsewhere', s0 != s1 and sf0 == sf1, '%s -> %s | %s %s' % (s0, s1, sf0, sf1))

        # ---- Dispersion ----
        await tool('dispersion')
        d0 = await p.evaluate(MEAN, [700, 350, 200])
        await drag_doc([(300, 300), (300, 450)])
        await p.wait_for_timeout(500)
        await s.shot('c9_dispersion')
        await apply()
        d1 = await p.evaluate(MEAN, [700, 350, 200])
        check('dispersion throws pieces over the picture', d0 != d1, '%s -> %s' % (d0, d1))

        # ---- Replay ----
        n0 = await p.evaluate(BASE)
        await s.tb('replay'); await p.wait_for_selector('.flare-cell'); await p.wait_for_timeout(300)
        await s.shot('c10_replay_sheet')
        await p.click('.flare-cell[data-id="pola"]')
        await p.wait_for_function("RT.Doc.layers.some(l => l.name === 'Frame')", timeout=15000); await p.wait_for_timeout(700)
        n1 = await p.evaluate(BASE)
        names = await p.evaluate("RT.Doc.layers.map(l => l.name)")
        check('replay runs its steps, each one an undo step', n1[4] == n0[4] + 2 and n1[5] == n0[5] + 3 and names[-2:] == ['Mask', 'Frame'], '%s -> %s %s' % (n0, n1, names))
        await s.shot('c11_replay_done')
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
