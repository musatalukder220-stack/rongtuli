import asyncio, sys, glob
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
FONT = (glob.glob('/usr/share/fonts/**/*.ttf', recursive=True) + glob.glob('/usr/share/fonts/**/*.otf', recursive=True))[0]
async def main():
    async with Session() as s:
        await s.open('?demo=1'); p = s.page; await p.wait_for_timeout(300)
        await s.tb('text'); await p.fill('.te-in', 'Colour test'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        # custom colour picker
        await s.tb('color'); await p.click('#panel .sw.custom'); await p.wait_for_timeout(300)
        box = await p.locator('.cp-sv').bounding_box()
        await s.drag(box['x'] + 20, box['y'] + 20, box['x'] + box['width']*0.9, box['y'] + box['height']*0.15)
        await p.evaluate("(() => { const r = document.querySelector('.sheet input.hue'); r.value = 200; r.dispatchEvent(new Event('input', {bubbles:true})); r.dispatchEvent(new Event('change', {bubbles:true})); })()")
        await s.shot('90_picker')
        print('picked colour', await p.evaluate("RT.Doc.selected().color"), 'hex field', await p.input_value('.cp-hex'))
        await p.fill('.cp-hex', '#12ab34'); await p.dispatch_event('.cp-hex', 'change')
        print('typed colour', await p.evaluate("RT.Doc.selected().color"))
        await p.click('.sheet .btn.pri')
        # add a font file
        await s.tb('font'); await p.wait_for_timeout(200)
        async with p.expect_file_chooser() as fc:
            await p.click('.fchip:has-text("+ Font")')
        await (await fc.value).set_files(FONT)
        await p.wait_for_timeout(600)
        print('font file', FONT.split('/')[-1], '-> layer font:', await p.evaluate("RT.Doc.selected().font"), '| my fonts:', await p.evaluate("RT.Fonts.list.filter(f => f.group === 'my').map(f => f.family)"))
        # a file that is not a font
        async with p.expect_file_chooser() as fc:
            await p.click('.fchip:has-text("+ Font")')
        await (await fc.value).set_files('/home/user/uploads/IMG_20261111_091333.jpg')
        await p.wait_for_timeout(500)
        print('toast after bad font:', await p.inner_text('#toast'))
        # stickers + layers panel actions
        await p.mouse.click(8, 62); await p.wait_for_timeout(150)
        await s.tb('sticker'); await p.wait_for_timeout(300); await p.click('.st-grid .st-cell >> nth=1'); await p.wait_for_timeout(400)
        print('layers', (await s.state())['layers'])
        await p.click('#fab-layers'); await p.wait_for_timeout(200)
        order = lambda: p.evaluate("RT.Doc.layers.map(l => l.name)")
        print('order', await order())
        await p.click('.ly-acts button[title="Move backward"]'); print('after backward', await order())
        print('backward disabled at floor?', await p.evaluate("document.querySelector('.ly-acts button[title=\"Move backward\"]').disabled"))
        await p.click('.ly-acts button[title="Move forward"]'); print('after forward', await order())
        await p.click('.ly[data-id] >> nth=0 >> button[title="Hide"]'); print('visible flags', await p.evaluate("RT.Doc.layers.map(l => l.visible)"))
        await p.click('.ly[data-id] >> nth=0 >> button[title="Show"]')
        # select the background row, unlock it
        await p.click('.ly >> nth=2 >> .nm'); print('selected', await p.evaluate("RT.Doc.selected().name"), 'toolbar first item:', await p.inner_text('#toolbar .tb-item >> nth=0'))
        await p.click('.ly >> nth=2 >> button[title="Unlock"]'); print('bg locked?', await p.evaluate("RT.Doc.layers[0].locked"))
        await p.click('.ly >> nth=2 >> button[title="Lock"]')
        await s.shot('91_layers3')
        await p.click('.ly-acts .chip:has-text("Merge all")'); await p.wait_for_timeout(200); await p.click('.dialog .btn.pri'); await p.wait_for_timeout(400)
        print('after merge', await s.state())
        await p.click('.sheet .sheet-h button[title="Close"]')
        await s.top('Undo'); await p.wait_for_timeout(200); print('undo merge ->', (await s.state())['n'], 'layers')
        s.errors = [e for e in s.errors if 'willReadFrequently' not in e]
        s.report()
    # desktop keyboard
    async with Session(1100, 760, 1, False) as s:
        await s.open('?demo=1'); p = s.page; await p.wait_for_timeout(300)
        await s.tb('text'); await p.fill('.te-in', 'Keys'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        x0 = await p.evaluate("RT.Doc.selected().x")
        await p.keyboard.press('ArrowRight'); await p.keyboard.press('Shift+ArrowRight')
        print('arrow keys moved by', round(await p.evaluate("RT.Doc.selected().x") - x0, 1), 'doc px')
        await p.keyboard.press('Delete'); print('after Delete', (await s.state())['n'])
        await p.keyboard.press('Control+z'); print('after Ctrl+Z', (await s.state())['n'])
        await p.keyboard.press('Control+Shift+z'); print('after Ctrl+Shift+Z', (await s.state())['n'])
        # mouse wheel zoom
        await p.mouse.move(550, 350); await p.mouse.wheel(0, -600); await p.wait_for_timeout(200)
        print('wheel zoom', await p.evaluate("[+RT.View.scale.toFixed(3), +RT.View.fitScale.toFixed(3)]"))
        s.report()
asyncio.run(main())
