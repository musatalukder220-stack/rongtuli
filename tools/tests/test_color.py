import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
SETR = "(v) => { const i = document.querySelector('#panel input[type=range]'); i.value = v; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); }"
PIX = "(() => { const c = RT.Doc.layers[0].bitmap; const d = c.getContext('2d').getImageData(c.width>>1, c.height>>2, 1, 1).data; return [d[0],d[1],d[2],d[3]]; })()"
async def main():
    async with Session() as s:
        await s.open('?demo=1')
        p = s.page
        await p.wait_for_timeout(300)
        print('pixel before', await p.evaluate(PIX))
        # ---------- ADJUST ----------
        await s.tb('tools'); await p.click('.tool-cell[data-id="adjust"]')
        await p.evaluate(SETR, 40)
        await s.tb('saturation'); await p.evaluate(SETR, 60)
        await s.tb('clarity'); await p.evaluate(SETR, 50)
        await p.wait_for_timeout(200)
        await s.shot('20_adjust')
        t = await p.evaluate("(async () => { const t0 = performance.now(); await RT.UI.applyMode(); return performance.now() - t0; })()")
        print('adjust apply ms', round(t), await s.state())
        print('pixel after adjust', await p.evaluate(PIX))
        # ---------- CURVES ----------
        await s.tb('tools'); await p.click('.tool-cell[data-id="curves"]')
        await p.wait_for_timeout(200)
        box = await p.locator('.curve-wrap canvas').bounding_box()
        print('curve box', box)
        cx, cy, n = box['x'] + 14, box['y'] + 14, box['width'] - 28
        # add a point at the 1/4 mark and pull it down, another at 3/4 and pull it up (S-curve)
        await s.drag(cx + n*0.25, cy + n*0.75, cx + n*0.3, cy + n*0.88)
        await s.drag(cx + n*0.75, cy + n*0.25, cx + n*0.7, cy + n*0.12)
        await p.click('#toolbar .chip[data-v="b"]')
        await s.drag(cx + n*0.5, cy + n*0.5, cx + n*0.45, cy + n*0.35)
        await s.shot('21_curves')
        pts = await p.evaluate("1")
        await s.top('Apply'); await p.wait_for_timeout(600)
        print('after curves', await s.state()); print('pixel after curves', await p.evaluate(PIX))
        # ---------- EFFECTS ----------
        await s.tb('effects'); await p.wait_for_timeout(1500)
        await s.shot('22_effects_fx')
        await p.click('.fx-it[data-id="vintage"]'); await p.wait_for_timeout(400)
        await s.shot('23_effects_vintage')
        for cat in ['bw','blur','art','color','distort']:
            await p.click('#toolbar .chip[data-v="%s"]' % cat); await p.wait_for_timeout(1500)
            await s.shot('24_effects_' + cat)
        await p.click('.fx-it[data-id="swirl"]'); await p.wait_for_timeout(500)
        await s.shot('25_effects_swirl')
        t = await p.evaluate("(async () => { const t0 = performance.now(); await RT.UI.applyMode(); return performance.now() - t0; })()")
        print('swirl apply ms', round(t), await s.state())
        # time every effect at full size
        times = await p.evaluate("""(() => { const c = RT.Doc.layers[0].bitmap, out = {}; for (const f of RT.FX.list) { const t0 = performance.now(); try { const r = f.run(c, f.kind === 'strength' ? f.def/100 : 1, Math.max(c.width,c.height)/1000); if (r.width !== c.width || r.height !== c.height) out[f.id] = 'SIZE'; else out[f.id] = Math.round(performance.now() - t0); } catch (e) { out[f.id] = 'ERR ' + e.message; } } return out; })()""")
        print('effect ms at 1600x1200:', times)
        s.report()
asyncio.run(main())
