import asyncio, sys, math
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
PHOTO = '/home/user/uploads/IMG_20261111_091333.jpg'
async def main():
    # ---------- blank canvas + add photo + image options, phone ----------
    async with Session() as s:
        await s.open()
        p = s.page
        await p.click('#btn-blank'); await p.wait_for_timeout(300)
        await s.shot('60_blank_sheet')
        await p.click('.size-opt >> nth=2')         # Story 1080x1920
        await p.click('.sheet .sw[data-c="#fde047"]')
        await p.click('#btn-create'); await p.wait_for_timeout(400)
        print('blank', await s.state(), await p.evaluate("JSON.stringify(RT.Doc.bg)"))
        async with p.expect_file_chooser() as fc:
            await s.tb('addphoto')
        await (await fc.value).set_files(PHOTO)
        await p.wait_for_function("RT.Doc.layers.length === 1", timeout=15000); await p.wait_for_timeout(400)
        print('photo added', await s.state())
        await s.tb('flipH'); await s.tb('opacity')
        await p.evaluate("(() => { const r = document.querySelector('#panel input[type=range]'); r.value = 70; r.dispatchEvent(new Event('input', {bubbles:true})); r.dispatchEvent(new Event('change', {bubbles:true})); })()")
        await s.tb('blend'); await p.click('#panel .chip[data-v="multiply"]')
        print('layer props', await p.evaluate("(() => { const l = RT.Doc.selected(); return [l.flipH, l.opacity, l.blend]; })()"))
        await s.tb('effects'); await p.wait_for_timeout(800)
        await p.click('#toolbar .chip[data-v="bw"]'); await p.wait_for_timeout(600)
        await p.click('.fx-it[data-id="noir"]'); await p.wait_for_timeout(300)
        await s.top('Apply'); await p.wait_for_timeout(600)
        print('after layer effect', await s.state())
        await s.tb('dup'); await p.wait_for_timeout(200)
        print('after duplicate', (await s.state())['layers'])
        # text on top, then crop the canvas: objects must follow
        await p.mouse.click(8, 62); await p.wait_for_timeout(200)
        await s.tb('text'); await p.fill('.te-in', 'STORY'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        await s.tb('font'); await p.click('.fchip[data-font="Bebas Neue"]')
        await s.shot('61_story')
        before = await p.evaluate("RT.Doc.layers.map(l => [Math.round(l.x), Math.round(l.y)])")
        await p.mouse.click(8, 62); await p.wait_for_timeout(200)
        await s.tb('tools'); await p.click('.tool-cell[data-id="crop"]'); await p.click('#panel .chip[data-v="1:1"]'); await s.top('Apply'); await p.wait_for_timeout(300)
        after = await p.evaluate("RT.Doc.layers.map(l => [Math.round(l.x), Math.round(l.y)])")
        print('crop moved layers', before, '->', after, (await s.state())['w'], (await s.state())['h'])
        # more menu: background colour, save as PNG
        await s.top('More'); await p.wait_for_timeout(200); await s.shot('62_more')
        await p.click('.row-btn:has-text("Background colour")'); await p.wait_for_timeout(200)
        await p.click('.sheet .sw.none'); await p.wait_for_timeout(200)
        await p.click('.sheet .sheet-h button[title="Close"]')
        print('bg now', await p.evaluate("JSON.stringify(RT.Doc.bg)"), 'transparent?', await p.evaluate("RT.Doc.hasTransparency()"))
        async with p.expect_download() as dl:
            await s.top('Save picture')
        d = await dl.value; await d.save_as('/tmp/shots/' + d.suggested_filename); print('quick save ->', d.suggested_filename)
        from PIL import Image
        im = Image.open('/tmp/shots/' + d.suggested_filename); print('file', im.size, im.mode, 'corner px', im.getpixel((2, 2)))
        await s.shot('63_transparent')
        # close the editor -> confirm dialog -> home
        await s.top('Close'); await p.wait_for_timeout(200); await s.shot('64_leave')
        await p.click('.dialog .btn[data-v="no"]'); await p.wait_for_timeout(300)
        print('home visible', await p.is_visible('#btn-open'), 'doc open', await p.evaluate("RT.Doc.open"))
        s.report()
    # ---------- desktop ----------
    async with Session(1280, 800, 1, False) as s:
        await s.open('?demo=1'); p = s.page; await p.wait_for_timeout(300)
        await s.tb('tools'); await s.shot('65_desktop')
        await p.click('.tool-cell[data-id="adjust"]'); await p.wait_for_timeout(200); await s.shot('66_desktop_adjust')
        s.report()
asyncio.run(main())
