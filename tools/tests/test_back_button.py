import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    async with Session() as s:
        p = s.page
        await p.goto('http://localhost:8000/'); await p.wait_for_function("window.RT && RT.Fonts.list.length > 4", timeout=20000)
        await p.click('#btn-demo'); await p.wait_for_timeout(300)
        async def back(label):
            await p.go_back(wait_until='commit'); await p.wait_for_timeout(250)
            st = await p.evaluate("(() => ({url: location.pathname, open: RT.Doc.open, mode: RT.UI.mode() ? RT.UI.mode().title : null, sel: !!RT.Doc.selectedId, sheets: document.querySelectorAll('#sheets .backdrop').length, te: document.querySelectorAll('.te').length, tools: !!document.querySelector('.tools-pop'), home: !document.querySelector('#home').classList.contains('hidden')}))()")
            print('%-28s' % label, st)
        await s.tb('tools'); await back('tools grid open -> back')
        await s.tb('tools'); await p.click('.tool-cell[data-id="adjust"]'); await back('adjust mode -> back')
        await s.tb('sticker'); await p.wait_for_timeout(200); await back('sticker sheet -> back')
        await s.tb('text'); await p.wait_for_timeout(200); await back('text editor -> back')
        await s.tb('text'); await p.fill('.te-in', 'Back'); await p.click('.te-top button[title="Done"]'); await p.wait_for_timeout(300)
        await s.tb('color'); await back('colour panel -> back')
        await back('selected layer -> back')
        await back('edited doc -> back (asks)')
        await back('dialog -> back (stays)')
        await back('again -> asks')
        await p.click('.dialog .btn[data-v="no"]'); await p.wait_for_timeout(300)
        print('left to home:', await p.is_visible('#btn-open'), 'doc open', await p.evaluate("RT.Doc.open"))
        s.report()
asyncio.run(main())
