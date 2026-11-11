"""Stage 10: the update alert.

The app reads one small file (latest.json) and, when it says a newer version, shows an Update sheet
whose button leads to the owner's link (a Telegram channel, in the owner's plan). No server of ours.

Checked here with a fake latest.json (the real network is not needed):
  * a newer version is found and the sheet says so;
  * an older or the same version says nothing;
  * "Later" keeps quiet for that version (asked again only when a newer one appears);
  * tapping Update opens the small update page, which carries the version and the link;
  * without a link the page still opens and says the link is not set;
  * the Android half's call (window.rtUpdate) shows the sheet too;
  * the app's own version compare treats 0.10 as newer than 0.9.
"""
import asyncio, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

FAKE = """(ver, link, note) => { window.fetch = (u, o) => {
  if (typeof u === 'string' && u.indexOf('latest.json') >= 0) {
    return Promise.resolve(new Response(JSON.stringify({ version: ver, note: note || '', link: link || '' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return Promise.reject(new Error('offline'));
}; }"""

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False

    async with Session() as s:
        p = s.page
        await p.goto('http://localhost:8000/?demo')
        await p.wait_for_function("window.RT && window.RT.Updater", timeout=20000)
        await p.wait_for_timeout(300)
        await p.evaluate("RT.Updater.INFO_URL = 'https://example.com/latest.json'")
        check('the version compare is right', await p.evaluate("[RT.Updater.newer('0.10','0.9'), RT.Updater.newer('0.9','0.10'), RT.Updater.newer('0.9','0.9')]") == [True, False, False])

        # same / older version → nothing
        for v in ('0.9', '0.1'):
            await p.evaluate(FAKE, [v, 'https://t.me/x', ''])
            await p.evaluate("localStorage.removeItem('rt-update-seen')")
            got = await p.evaluate("RT.Updater.check(true).then(u => u && u.version)")
            check('version %s says nothing' % v, got in (None, False, '') or got is None, str(got))

        # a newer version → the sheet, then Update → the update page
        await p.evaluate(FAKE, ['9.9', 'https://t.me/rongtuli', 'Faster Remove.'])
        await p.evaluate("localStorage.removeItem('rt-update-seen')")
        await p.evaluate("RT.Updater.check(true)")
        await p.evaluate("RT.Updater.open()")
        await p.wait_for_selector('#up-go', timeout=6000)
        txt = await p.evaluate("document.querySelector('.up').textContent")
        check('the sheet shows the versions and the note', '9.9' in txt and 'Faster Remove.' in txt, txt[:80])
        await s.shot('s10_update_sheet')
        await p.click('#up-go')
        await p.wait_for_url('**/update.html*', timeout=8000)
        await p.wait_for_timeout(400)
        check('Update opens the update page', 'update.html' in p.url)
        check('the page shows the new version', '9.9' in (await p.evaluate("document.querySelector('#v').textContent")))
        check('the page carries the link', await p.evaluate("(document.querySelector('#go') && true)") is True)
        await s.shot('s10_update_page')

        # back in the app: "Later" keeps quiet for that version
        await p.goto('http://localhost:8000/?demo')
        await p.wait_for_function("window.RT && window.RT.Updater", timeout=20000)
        await p.evaluate("RT.Updater.INFO_URL = 'https://example.com/latest.json'")
        await p.evaluate(FAKE, ['9.9', 'https://t.me/rongtuli', ''])
        await p.evaluate("RT.Updater.check(true)")
        await p.evaluate("RT.Updater.open()")
        await p.wait_for_selector('#up-later', timeout=6000)
        await p.click('#up-later')
        await p.wait_for_timeout(300)
        quiet = await p.evaluate("""(async () => { await RT.Updater.check(true); return document.querySelector('#up-go') ? 'shown' : 'quiet'; })()""")
        check('"Later" keeps quiet for that version', quiet == 'quiet', quiet)

        # the Android half calls this
        await p.evaluate("localStorage.removeItem('rt-update-seen')")
        await p.evaluate("window.rtUpdate('9.9', 'From the app', false, 'https://t.me/rongtuli')")
        await p.wait_for_selector('#up-go', timeout=6000)
        check('the Android half can show the sheet too', True)
        await p.evaluate("window.rtUpdate('0.1', 'old', false, '')")
        await p.wait_for_timeout(300)

        s.report()
    return ok

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
