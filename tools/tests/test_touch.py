import asyncio, sys, math
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    async with Session() as s:
        await s.open('?demo=1')
        p = s.page
        cdp = await s.ctx.new_cdp_session(p)
        async def touch(kind, pts):
            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i, 'radiusX': 5, 'radiusY': 5, 'force': 1} for i, (x, y) in enumerate(pts)]})
        async def pinch(c, d0, d1, a0=0.0, a1=0.0, steps=10, shift=(0, 0)):
            def pts(d, a, t):
                cx, cy = c[0] + shift[0]*t, c[1] + shift[1]*t
                return [(cx - math.cos(a)*d/2, cy - math.sin(a)*d/2), (cx + math.cos(a)*d/2, cy + math.sin(a)*d/2)]
            p0 = pts(d0, a0, 0)
            await touch('touchStart', [p0[0]])
            await touch('touchMove', p0)       # second finger lands
            for i in range(1, steps+1):
                t = i/steps
                await touch('touchMove', pts(d0 + (d1-d0)*t, a0 + (a1-a0)*t, t))
            await touch('touchEnd', [])
            await p.wait_for_timeout(120)
        vs = "(() => ({scale: +RT.View.scale.toFixed(4), fit: +RT.View.fitScale.toFixed(4), tx: Math.round(RT.View.tx), ty: Math.round(RT.View.ty)}))()"
        await p.wait_for_timeout(300)
        print('view before', await p.evaluate(vs))
        # --- pinch on the photo with nothing selected: zooms the view
        await pinch((195, 400), 80, 240)
        print('view after pinch-out', await p.evaluate(vs), 'hist', (await s.state())['hist'])
        await s.shot('50_zoomed')
        # one-finger drag pans when zoomed
        await touch('touchStart', [(195, 400)])
        for i in range(1, 8): await touch('touchMove', [(195 - i*12, 400)])
        await touch('touchEnd', []); await p.wait_for_timeout(100)
        print('view after pan', await p.evaluate(vs))
        await pinch((195, 400), 240, 40)
        print('view after pinch-in', await p.evaluate(vs))
        # --- add text, then pinch: scales + rotates the selected layer
        await s.tb('text'); await p.fill('.te-in', 'Pinch me'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        L = "(() => { const l = RT.Doc.selected(); return l ? {x: Math.round(l.x), y: Math.round(l.y), s: +l.scaleX.toFixed(3), rot: +(l.rotation*180/Math.PI).toFixed(1)} : null; })()"
        print('layer before', await p.evaluate(L), 'hist', (await s.state())['hist'])
        await pinch((195, 300), 100, 200, 0.0, math.pi/6, shift=(0, 40))
        print('layer after pinch', await p.evaluate(L), 'hist', (await s.state())['hist'], 'view', await p.evaluate(vs))
        # --- single finger drag on the text moves it
        c = await p.evaluate("(() => { const l = RT.Doc.selected(), v = RT.View.toView(l.x, l.y), r = document.querySelector('#view').getBoundingClientRect(); return [v[0] + r.left, v[1] + r.top]; })()")
        await touch('touchStart', [tuple(c)])
        for i in range(1, 8): await touch('touchMove', [(c[0] + i*8, c[1] - i*10)])
        await touch('touchEnd', []); await p.wait_for_timeout(100)
        print('layer after drag', await p.evaluate(L), 'hist', (await s.state())['hist'])
        # --- double tap opens the text editor
        c = await p.evaluate("(() => { const l = RT.Doc.selected(), v = RT.View.toView(l.x, l.y), r = document.querySelector('#view').getBoundingClientRect(); return [v[0] + r.left, v[1] + r.top]; })()")
        for _ in range(2):
            await touch('touchStart', [tuple(c)]); await touch('touchEnd', []); await p.wait_for_timeout(90)
        await p.wait_for_timeout(200)
        print('editor open after double tap:', await p.locator('.te-in').count(), repr(await p.input_value('.te-in')) if await p.locator('.te-in').count() else '')
        await p.fill('.te-in', 'Edited!'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(200)
        print('text now', await p.evaluate("RT.Doc.selected().text"), 'hist', (await s.state())['hist'])
        # --- tap the delete handle
        d = await p.evaluate("(() => { const g = RT.View.selGeom(RT.Doc.selected()), r = document.querySelector('#view').getBoundingClientRect(); return [g.handles.del[0] + r.left, g.handles.del[1] + r.top]; })()")
        await touch('touchStart', [tuple(d)]); await touch('touchEnd', []); await p.wait_for_timeout(200)
        print('after delete', await s.state())
        # undo all the way, redo all the way
        n = 0
        while await p.evaluate("RT.History.canUndo()"):
            await s.top('Undo'); n += 1
        print('undos', n, await s.state())
        while await p.evaluate("RT.History.canRedo()"):
            await s.top('Redo')
        print('redone', await s.state())
        # --- draw with touch + pinch in draw mode must not leave a stroke
        await s.tb('draw'); await p.wait_for_timeout(200)
        await pinch((195, 300), 80, 200)
        print('draw: view after pinch', await p.evaluate(vs), 'undo enabled', await p.evaluate("!document.querySelector('#topbar button[title=\"Undo\"]').disabled"))
        await touch('touchStart', [(120, 300)])
        for i in range(1, 10): await touch('touchMove', [(120 + i*15, 300 + i*5)])
        await touch('touchEnd', []); await p.wait_for_timeout(100)
        print('draw: undo enabled after stroke', await p.evaluate("!document.querySelector('#topbar button[title=\"Undo\"]').disabled"))
        await s.top('Apply'); await p.wait_for_timeout(300)
        print('after draw', await s.state(), await p.evaluate(vs))
        s.report()
asyncio.run(main())
