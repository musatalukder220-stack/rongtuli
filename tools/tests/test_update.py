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

        # a newer version → the owner's blocking card (one button, English, no second sheet)
        await p.evaluate("localStorage.removeItem('rt-update-seen')")
        await p.evaluate("localStorage.removeItem('rt-intro-off')")
        await p.evaluate(FAKE, ['9.9', 'https://github.com/x/RongTuli-9.9.apk', 'Faster Remove.'])
        await p.evaluate("RT.Updater.check(true)")
        await p.evaluate("RT.Updater.open()")
        await p.wait_for_selector('#ver-go', timeout=6000)
        txt = await p.evaluate("document.querySelector('.vercard').innerText")
        check('a newer version opens the blocking card itself', await p.evaluate("!!document.querySelector('#verwrap')"))
        check('the card is in English and carries the version', 'A new version of RongTuli is here!' in txt and 'Version 9.9' in txt, txt[:90])
        check('one button only', await p.evaluate("Array.from(document.querySelectorAll('#verwrap button')).map(b=>b.textContent)") == ['Download Now'])
        check('there is no second sheet (no Update / Later)', await p.evaluate("!document.querySelector('#up-go') && !document.querySelector('#up-later')"))
        await s.shot('s10_update_card')
        # the button opens the Telegram channel, never the GitHub page
        await p.evaluate("(window.__u='', window.RTAndroid={setLock(){}, quit(){}, openUrl(u){window.__u=u}}, 1)")
        await p.click('#ver-go')
        await p.wait_for_timeout(250)
        check('Download Now goes to the Telegram channel', str(await p.evaluate("window.__u")).startswith('https://t.me/rongtuli'), await p.evaluate("window.__u"))

        # the Android half calls this
        await p.evaluate("RT.Forced.hide()")
        await p.evaluate("window.rtUpdate('9.9', 'From the app', false, 'https://github.com/x/RongTuli-9.9.apk')")
        await p.wait_for_selector('#ver-go', timeout=6000)
        check('the Android half can show the card too', True)
        await p.evaluate("RT.Forced.hide()")
        await p.evaluate("window.rtUpdate('0.1', 'old', false, '')")
        await p.wait_for_timeout(300)

        s.report()
    return ok

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
