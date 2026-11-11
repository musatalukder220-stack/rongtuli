import asyncio, sys, math
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    async with Session() as s:
        await s.open('?demo=1')
        p = s.page
        await p.wait_for_timeout(300)
        # ---------- DRAW ----------
        await s.tb('draw'); await p.wait_for_timeout(300)
        st = await s.stage(); print('stage in draw', st)
        fr = await p.evaluate("(() => { const a = RT.View.toView(0,0), b = RT.View.toView(RT.Doc.width, RT.Doc.height); return [a[0],a[1],b[0],b[1]]; })()")
        ox, oy = st[0] + fr[0], st[1] + fr[1]; fw, fh = fr[2]-fr[0], fr[3]-fr[1]
        async def wave(y, amp=18, x0=0.1, x1=0.9):
            m = p.mouse
            await m.move(ox + fw*x0, oy + fh*y); await m.down()
            for i in range(1, 41):
                t = i/40
                await m.move(ox + fw*(x0 + (x1-x0)*t), oy + fh*y + math.sin(t*math.pi*4)*amp)
            await m.up()
        await wave(0.15)
        await s.tb('marker'); await p.click('#panel .sw[data-c="#fde047"]'); await wave(0.32)
        await s.tb('neon'); await p.click('#panel .sw[data-c="#06b6d4"]'); await wave(0.5)
        await s.tb('spray'); await p.click('#panel .sw[data-c="#ffffff"]'); await wave(0.68)
        await s.tb('pen'); await p.click('#panel .sw[data-c="#22c55e"]'); await wave(0.85)
        await s.tb('eraser'); 
        await s.drag(ox + fw*0.5, oy + fh*0.05, ox + fw*0.5, oy + fh*0.95, 30)
        await s.shot('40_draw')
        print('undo enabled?', await p.evaluate("!document.querySelector('#topbar button[title=\"Undo\"]').disabled"))
        await s.top('Undo'); await p.wait_for_timeout(200); await s.shot('41_draw_undo')
        await s.top('Redo'); await p.wait_for_timeout(200)
        await s.top('Apply'); await p.wait_for_timeout(500)
        print('after draw', await s.state())
        await s.shot('42_draw_applied')
        # ---------- LAYERS ----------
        await p.click('#fab-layers'); await p.wait_for_timeout(300)
        await s.shot('43_layers')
        await p.click('.sheet .sheet-h button[title="Close"]')
        # ---------- EXPORT ----------
        await p.mouse.click(20, 70 + 56); await p.wait_for_timeout(200)
        print('sel', (await s.state())['sel'])
        await s.top('Export'); await p.wait_for_function("!document.querySelector('#btn-save').disabled", timeout=15000)
        print('export info:', await p.inner_text('.ex-info'))
        await s.shot('44_export')
        async with p.expect_download() as dl:
            await p.click('#btn-save')
        d = await dl.value
        path = '/tmp/shots/' + d.suggested_filename
        await d.save_as(path)
        print('downloaded', d.suggested_filename)
        await p.click('#sheets .chip[data-v="png"]'); await p.wait_for_function("document.querySelector('.ex-info').textContent.includes('PNG')", timeout=15000)
        print('export info:', await p.inner_text('.ex-info'))
        await p.click('.sheet .sheet-h button[title="Close"]')
        async with p.expect_download() as dl:
            await s.top('Save picture')
        d2 = await dl.value; await d2.save_as('/tmp/shots/quick_' + d2.suggested_filename); print('quick save', d2.suggested_filename)
        s.report(); print("ok")
        from PIL import Image
        im = Image.open(path); print('saved file', im.size, im.format)
asyncio.run(main())
