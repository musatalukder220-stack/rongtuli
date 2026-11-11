import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    async with Session() as s:
        await s.open('?demo=1')
        p = s.page
        await p.wait_for_timeout(300)
        # ---------- CROP ----------
        await s.tb('tools'); await p.click('.tool-cell[data-id="crop"]')
        st = await s.stage(); print('stage', st, (await s.state())['mode'])
        # frame corners in view px
        fr = await p.evaluate("(() => { const a = RT.View.toView(0,0), b = RT.View.toView(RT.Doc.width, RT.Doc.height); return [a[0],a[1],b[0],b[1]]; })()")
        print('frame', [round(v) for v in fr])
        ox, oy = st[0], st[1]
        # drag bottom-right corner inwards, top-left corner inwards
        await s.drag(ox+fr[2], oy+fr[3], ox+fr[2]-90, oy+fr[3]-60)
        await s.drag(ox+fr[0], oy+fr[1], ox+fr[0]+50, oy+fr[1]+40)
        print('info after free drag:', await p.inner_text('.crop-info'))
        await s.shot('10_crop_free')
        await p.click('#panel .chip[data-v="1:1"]')
        print('info 1:1:', await p.inner_text('.crop-info'))
        # drag a corner with the ratio locked
        fr2 = await p.evaluate("(() => { const m = RT.UI.mode(); return 1; })()")
        await s.shot('11_crop_square')
        await s.top('Apply')
        await p.wait_for_timeout(300)
        print('after crop', await s.state())
        await s.top('Undo'); await p.wait_for_timeout(200)
        print('after undo', await s.state())
        await s.top('Redo'); await p.wait_for_timeout(200)
        print('after redo', await s.state())
        # ---------- FLIP / ROTATE ----------
        await s.top('Undo'); await p.wait_for_timeout(200)
        await s.tb('tools'); await p.click('.tool-cell[data-id="fliprotate"]')
        await s.tb('rotR'); await s.tb('flipH')
        await p.evaluate("(() => { const i = document.querySelector('#panel input[type=range]'); i.value = 12; i.dispatchEvent(new Event('input', {bubbles:true})); })()")
        await s.shot('12_rotate')
        await s.top('Apply'); await p.wait_for_timeout(500)
        print('after rotate', await s.state())
        await s.shot('13_rotated')
        # ---------- RESIZE ----------
        await s.tb('tools'); await p.click('.tool-cell[data-id="resize"]')
        await p.wait_for_timeout(200)
        await s.shot('14_resize')
        await p.click('.sheet .chip:has-text("50%")')
        await p.click('#btn-resize'); await p.wait_for_timeout(500)
        print('after resize', await s.state())
        s.report()
asyncio.run(main())
