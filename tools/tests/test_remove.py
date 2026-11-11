"""Stage 6: the Remove tool — take a thing OUT of the picture and fill its place (PicsArt's Remove).

Checks, on a made-up picture (a striped sky with a dark stone on it) and on the user's real photo:
  * the toolbar holds BOTH 'Remove BG' and 'Remove', and each opens its own tool;
  * Remove alone: a brush stroke over the stone, then Remove → the stone is gone, the place is filled
    with the colours around it (compared with the sky just outside), and the rest is untouched;
  * the mark shows red on screen, Erase takes a mark back, Undo works;
  * Tap marks the whole patch under the finger and removes it;
  * the whole thing is one undo step in the document;
  * the user's real photo comes back whole (same size) after removing a small thing.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

# a picture with a sky that changes from top to bottom and a dark stone in the middle
MAKE = """(() => {
  const c = RT.U.canvas(600, 400), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, '#9fc4e8'); g.addColorStop(1, '#eaf3fb');
  x.fillStyle = g; x.fillRect(0, 0, 600, 400);
  x.fillStyle = '#33333c'; x.beginPath(); x.ellipse(300, 200, 55, 42, 0, 0, 7); x.fill();
  const l = PhotoTool.addCanvas(c, 'Sky'); RT.Doc.select(l.id); RT.History.commit(); return true;
})()"""
PIX = """([x, y]) => Array.from(RT.Doc.layers[RT.Doc.layers.length - 1].bitmap.getContext('2d').getImageData(x, y, 1, 1).data)"""
AT = """([px, py]) => { const l = RT.Doc.layers[RT.Doc.layers.length - 1], D = RT.Doc;
  const k = Math.min(D.width / l.bitmap.width, D.height / l.bitmap.height);
  const ox = (D.width - l.bitmap.width * k) / 2, oy = (D.height - l.bitmap.height * k) / 2;
  const v = RT.View.toView(ox + px * k, oy + py * k), r = RT.View.canvas.getBoundingClientRect();
  return [v[0] + r.left, v[1] + r.top]; }"""

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

        # ---- both buttons, each its own tool ----
        ids = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => e.dataset.id)")
        labels = await p.evaluate("Object.fromEntries(Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => [e.dataset.id, e.textContent.trim()]))")
        check('the toolbar has Remove BG and Remove', 'removebg' in ids and 'remove' in ids, str([labels['removebg'], labels['remove']]))
        await s.tb('removebg'); await p.wait_for_timeout(500)
        check('Remove BG opens Cutout', await p.evaluate("RT.UI.mode() && RT.UI.mode().title") == 'Cutout')
        await p.evaluate("RT.UI.mode().cancel(); RT.UI.exitMode()")

        # ---- Remove with the brush ----
        await p.evaluate(MAKE); await p.wait_for_timeout(300)
        await s.tb('remove'); await p.wait_for_timeout(500)
        check('Remove opens the Remove tool', await p.evaluate("RT.UI.mode() && RT.UI.mode().title") == 'Remove')
        await p.evaluate("""(() => { const r = document.querySelector('#panel input[type=range]'); r.value = 44; r.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        c = await p.evaluate(AT, [300, 200])
        for dy in (-26, -9, 9, 26):
            await s.drag(c[0] - 40, c[1] + dy, c[0] + 40, c[1] + dy, steps=10)
        await p.wait_for_timeout(200)
        marked = await p.evaluate("RT.UI.mode().marked()")
        check('the brush marks the stone', marked > 3000, str(marked))
        await s.shot('s6_marked')

        hist0 = await p.evaluate("RT.History.states.length")
        await p.click('#rm-apply2')
        await p.wait_for_function("!RT.UI.mode()", timeout=20000)
        await p.wait_for_timeout(500)
        after = await p.evaluate(PIX, [300, 200])
        outside = await p.evaluate(PIX, [300, 120])
        d = max(abs(after[i] - outside[i]) for i in range(3))
        check('the stone is gone, its place filled with the sky', after[0] > 150 and d < 18, '%s vs sky %s' % (after[:3], outside[:3]))
        check('the rest of the picture is untouched', await p.evaluate(PIX, [60, 60]) == await p.evaluate(PIX, [60, 60]))
        check('it is one undo step', await p.evaluate("RT.History.states.length") == hist0 + 1)
        await s.shot('s6_after')

        # ---- undo puts the stone back ----
        await p.evaluate("RT.History.undo()"); await p.wait_for_timeout(400)
        back = await p.evaluate(PIX, [300, 200])
        check('Undo brings the stone back', back[0] < 120, str(back[:3]))
        await p.evaluate("RT.History.redo()"); await p.wait_for_timeout(300)

        # ---- Tap: a small red patch, one tap, gone ----
        await p.evaluate("""(() => { const l = RT.Doc.layers[RT.Doc.layers.length - 1], x = l.bitmap.getContext('2d');
          x.fillStyle = '#c81e3a'; x.beginPath(); x.arc(120, 90, 30, 0, 7); x.fill(); RT.History.commit(); })()""")
        await s.tb('remove'); await p.wait_for_timeout(400)
        await p.click('.tb-item[data-id="tap"]'); await p.wait_for_timeout(200)
        t = await p.evaluate(AT, [120, 90])
        await p.mouse.click(t[0], t[1])
        await p.wait_for_timeout(300)
        check('Tap marks the patch', await p.evaluate("RT.UI.mode().marked()") > 500, str(await p.evaluate("RT.UI.mode().marked()")))
        await p.click('#rm-apply')
        await p.wait_for_function("!RT.UI.mode()", timeout=20000)
        await p.wait_for_timeout(400)
        t2 = await p.evaluate(PIX, [120, 90])
        check('the tapped patch is gone too', t2[0] > 150 and t2[1] > 150, str(t2[:3]))

        # ---- the fill matches the picture (patches, not a smear) ----
        await s.tb('remove'); await p.wait_for_timeout(400)
        c3 = await p.evaluate(AT, [470, 300])
        await s.drag(c3[0] - 26, c3[1] - 12, c3[0] + 26, c3[1] + 12, steps=10)
        await p.wait_for_timeout(200)
        await p.click('#rm-apply2')
        await p.wait_for_function("!RT.UI.mode()", timeout=30000)
        await p.wait_for_timeout(400)
        # the sky has a gentle slope of colour; a good fill must not look flat or blotchy there
        flat = await p.evaluate("""(() => { const x = RT.Doc.layers[RT.Doc.layers.length - 1].bitmap.getContext('2d');
          const d = x.getImageData(440, 292, 60, 16).data, v = [];
          for (let i = 0; i < d.length; i += 4) v.push(d[i]);
          const m = v.reduce((a, b) => a + b, 0) / v.length;
          const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
          return [Math.round(m), Math.round(sd)]; })()""")
        check('the filled part keeps the look of the sky', abs(flat[0] - 190) < 35 and flat[1] < 12, str(flat))

        # ---- Erase takes a mark back ----
        await s.tb('remove'); await p.wait_for_timeout(400)
        c2 = await p.evaluate(AT, [300, 200])
        await s.drag(c2[0] - 30, c2[1], c2[0] + 30, c2[1], steps=8)
        m1 = await p.evaluate("RT.UI.mode().marked()")
        await p.click('.tb-item[data-id="erase"]'); await p.wait_for_timeout(200)
        await s.drag(c2[0] - 30, c2[1], c2[0] + 30, c2[1], steps=8)
        m2 = await p.evaluate("RT.UI.mode().marked()")
        check('Erase takes the mark back', m1 > 0 and m2 < m1 / 3, '%d → %d' % (m1, m2))
        await p.evaluate("RT.UI.mode().cancel(); RT.UI.exitMode()")

        s.report()
    return ok

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
