import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    async with Session() as s:
        await s.open('?demo=1'); p = s.page; await p.wait_for_timeout(300)
        ids = ['vivid','warm','cool','vintage','sepia','fade','film','cross','lomo','drama','hdr','glow','sunset','tealorange','rose','mint','dusk','golden']
        for i, fx in enumerate(ids):
            await s.tb('effects'); await p.wait_for_timeout(120)
            await p.click('.fx-it[data-id="%s"]' % fx)
            await s.top('Apply'); await p.wait_for_function("!RT.UI.mode()", timeout=20000); await p.wait_for_timeout(60)
        st = await p.evaluate("""(() => { const H = RT.History; const sizes = H.states.map(s => s.layers.map(l => l.bitmap.width + 'x' + l.bitmap.height).join('|')); return {n: H.states.length, idx: H.idx, mb: Math.round(H.bytes()/1e6), sizes: Array.from(new Set(sizes))}; })()""")
        print('after 18 effects:', st)
        n = 0
        while await p.evaluate("RT.History.canUndo()"):
            await s.top('Undo'); n += 1
        await p.wait_for_timeout(200)
        print('undos possible', n, await s.state())
        await s.shot('80_after_undo_all')
        # the picture at the oldest state must still be a real picture
        print('oldest bitmap', await p.evaluate("(() => { const b = RT.Doc.layers[0].bitmap; const d = b.getContext('2d').getImageData(b.width>>1, b.height>>1, 1, 1).data; return [b.width, b.height, d[0], d[1], d[2], d[3]]; })()"))
        while await p.evaluate("RT.History.canRedo()"):
            await s.top('Redo')
        # new change after undoing half-way drops the redo branch
        for _ in range(6): await s.top('Undo')
        await s.tb('text'); await p.fill('.te-in', 'branch'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        st = await p.evaluate("""(() => { const H = RT.History; return {n: H.states.length, idx: H.idx, mb: Math.round(H.bytes()/1e6), canRedo: H.canRedo(), sizes: Array.from(new Set(H.states.map(s => s.layers.map(l => l.bitmap ? l.bitmap.width + 'x' + l.bitmap.height : 'text').join('|'))))}; })()""")
        print('after branching:', st)
        s.errors = [e for e in s.errors if 'willReadFrequently' not in e]
        s.report()
asyncio.run(main())
