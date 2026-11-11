import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
PHOTO = '/home/user/uploads/IMG_20261111_091333.jpg'
def setr(i, v):
    return "(() => { const r = document.querySelectorAll('#panel input[type=range]')[%d]; r.value = %s; r.dispatchEvent(new Event('input', {bubbles:true})); r.dispatchEvent(new Event('change', {bubbles:true})); })()" % (i, v)
async def main():
    async with Session() as s:
        await s.open()
        p = s.page
        async with p.expect_file_chooser() as fc:
            await p.click('#btn-open')
        await (await fc.value).set_files(PHOTO)
        await p.wait_for_function("RT.Doc.open", timeout=15000)
        await p.wait_for_timeout(500)
        print('opened', await s.state())
        await s.shot('30_photo')
        # ---------- TEXT ----------
        await s.tb('text'); await p.wait_for_timeout(200)
        await p.fill('.te-in', 'Hello World')
        await s.shot('31_text_editor')
        await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        st = await s.state(); print('text added', st)
        await s.shot('32_text_added')
        await s.tb('font'); await p.wait_for_timeout(200)
        await p.click('.fchip[data-font="Pacifico"]'); await p.wait_for_timeout(200)
        await s.shot('33_font_panel')
        await s.tb('stroke'); await p.click('#panel .sw[data-c="#000000"]'); await p.evaluate(setr(0, 10))
        await s.tb('shadow'); await p.click('#panel .sw[data-c="#000000"]')
        await s.tb('bend'); await p.evaluate(setr(0, 35)); await p.wait_for_timeout(200)
        await s.shot('34_text_styled')
        # move it up by dragging, then scale using the handle
        info = await p.evaluate("(() => { const l = RT.Doc.selected(); const g = RT.View.selGeom(l); const r = document.querySelector('#view').getBoundingClientRect(); return {c: [g.ctr[0] + r.left, g.ctr[1] + r.top], sc: [g.handles.scale[0] + r.left, g.handles.scale[1] + r.top], rot: [g.handles.rot[0] + r.left, g.handles.rot[1] + r.top]}; })()")
        await s.drag(info['c'][0], info['c'][1], info['c'][0], info['c'][1] - 120)
        print('after move', (await s.state())['layers'][-1])
        # ---------- BENGALI TEXT ----------
        await p.mouse.click(20, 80 + 56)   # tap empty stage to deselect
        await p.wait_for_timeout(200)
        print('deselected', (await s.state())['sel'])
        await s.tb('text'); await p.fill('.te-in', 'আমার সোনার বাংলা\nরংতুলি'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        print('font of bn text:', await p.evaluate("RT.Doc.selected().font"))
        await s.tb('highlight'); await p.click('#panel .sw[data-c="#f43f5e"]'); await p.wait_for_timeout(200)
        await s.shot('35_bengali')
        await s.tb('font'); await p.wait_for_timeout(200); await s.shot('36_bn_fonts')
        # ---------- STICKER ----------
        await p.mouse.click(20, 80 + 56); await p.wait_for_timeout(200)
        await s.tb('sticker'); await p.wait_for_timeout(400)
        await s.shot('37_stickers')
        await p.click('.st-grid .st-cell >> nth=0'); await p.wait_for_timeout(500)
        print('sticker added', (await s.state())['layers'][-1])
        await p.mouse.click(20, 80 + 56); await p.wait_for_timeout(200)
        await s.tb('sticker'); await p.wait_for_timeout(300)
        await p.click('.st-tab >> nth=1'); await p.wait_for_timeout(300)
        await s.shot('38_emoji')
        await p.click('.st-grid .st-cell >> nth=12'); await p.wait_for_timeout(500)
        print('emoji added', (await s.state())['layers'][-1])
        await s.shot('39_all_objects')
        s.report()
asyncio.run(main())
