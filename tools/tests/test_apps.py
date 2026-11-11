import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    async with Session() as s:
        await s.open('?demo=1'); p = s.page; await p.wait_for_timeout(300)
        ids = await p.evaluate("Array.from(document.querySelectorAll('#toolbar .tb-item')).map(e => e.dataset.id + (e.classList.contains('soon') ? '*' : ''))")
        print('toolbar', ids)
        assert 'apps' in ids, 'Apps is not in the toolbar'
        await p.evaluate("document.querySelector('#toolbar .tb-item[data-id=apps]').scrollIntoView({inline: 'center'})")
        await p.wait_for_timeout(200)
        await s.tb('apps'); await p.wait_for_timeout(300)
        cells = await p.evaluate("Array.from(document.querySelectorAll('.app-cell')).map(e => e.dataset.id)")
        print('apps cells', cells)
        await s.shot('95_apps')
        opened = {}
        for c in cells:
            if c == 'addphoto': continue                      # opens the phone's file picker
            if not await p.locator('.app-cell').count():
                await p.evaluate("document.querySelector('#toolbar .tb-item[data-id=apps]').scrollIntoView({inline: 'center'})")
                await s.tb('apps'); await p.wait_for_timeout(250)
            await p.click('.app-cell[data-id="%s"]' % c); await p.wait_for_timeout(350)
            st = await p.evaluate("(() => ({mode: RT.UI.mode() ? RT.UI.mode().title : null, sheet: (document.querySelector('#sheets .sheet-h') || {}).textContent || null, te: !!document.querySelector('.te')}))()")
            opened[c] = st['mode'] or st['sheet'] or ('text editor' if st['te'] else None)
            # close whatever opened
            if st['te']: await p.click('.te-top button[title="Cancel"]')
            elif st['mode']: await s.top('Cancel')
            elif st['sheet']: await p.click('.sheet .sheet-h button[title="Close"]')
            await p.wait_for_timeout(250)
        print('each shortcut opened:', opened)
        assert all(opened.values()), 'a shortcut opened nothing'
        print('doc untouched:', await s.state())
        s.errors = [e for e in s.errors if 'willReadFrequently' not in e]
        s.report()
asyncio.run(main())
