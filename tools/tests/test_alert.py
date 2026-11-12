"""the two cards the owner asked for:
   * the Welcome card on the first open (and after a new install), "Don't show this again",
   * the blocking "new version" card: one button (Download Now), Back = hint then leave, no way in,
   * the trigger rule: the app's NAME + a VERSION in the caption, whatever else it says."""
import asyncio, json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

PAGE = ('<div class="tgme_widget_message_text">RongTuli 9.11<br/>Faster Remove<br/>'
        '<a href="https://t.me/rongtuli_app/12">Download</a></div>')
FAKE = """(html => { const real = window.fetch;
  window.fetch = async (u, o) => { const s = String(u);
    if (s.includes('t.me/s/')) return new Response(html, {status: 200, headers: {'content-type': 'text/html'}});
    return real(u, o); }; })"""


async def main():
    ok = True
    def check(name, cond, why=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + name + (('  ' + str(why)) if why and not cond else ''))
        ok = ok and bool(cond)

    async with Session() as s:
        p = s.page
        await p.goto('http://localhost:8000/'); await p.wait_for_function('window.RT', timeout=20000)
        await p.evaluate("localStorage.clear(); localStorage.setItem('rt-test-boot','1')")   # a brand-new phone
        await p.reload(); await p.wait_for_function('window.RT', timeout=20000)
        await p.wait_for_timeout(1400)

        # ---------- the Welcome card ----------
        check('the welcome card comes on the first open', await p.evaluate("!!document.querySelector('#welbg')"))
        txt = await p.evaluate("document.querySelector('.welcard').innerText")
        check('it shows @rongtuli_app, a Welcome pill, CLOSE / JOIN NOW and the tick',
              '@rongtuli_app' in txt and 'Welcome' in txt and 'CLOSE' in txt and 'JOIN NOW' in txt and "Don't show this again" in txt, txt)
        check('the logo is the app\'s own', await p.evaluate("!!document.querySelector('.wel-logo svg')"))
        await s.shot('alert_welcome')
        await p.click('#wel-close'); await p.wait_for_timeout(300)
        check('CLOSE puts it away', not await p.evaluate("!!document.querySelector('#welbg')"))
        # the owner's rule (1.6): CLOSE does not stop it — the next open shows the card again
        await p.reload(); await p.wait_for_function('window.RT', timeout=20000); await p.wait_for_timeout(1400)
        check('the next open shows the card again (CLOSE alone changes nothing)', await p.evaluate("!!document.querySelector('#welbg')"))
        check('Welcome.wanted() is true on every open until the tick', await p.evaluate("(() => { localStorage.setItem('rt-hello-ver', APP_VERSION); return Welcome.wanted(); })()") is True)
        # "Don't show this again" is remembered for good (the card is already on the screen after the reload)
        if not await p.evaluate("!!document.querySelector('#welbg')"):
            await p.evaluate("Welcome.show()")
        await p.wait_for_timeout(300)
        await p.click('#wel-never'); await p.click('#wel-close'); await p.wait_for_timeout(200)
        check('the tick stops it for good',
              await p.evaluate("localStorage.getItem('rt-hello-off')") == '1'
              and await p.evaluate("(localStorage.setItem('rt-hello-ver','0.0.1'), Welcome.wanted())") is False)

        # ---------- the trigger rules ----------
        cases = [
            ('RongTuli 1.1', '1.1'), ('🔥 RongTuli আপডেট 1.1 এসেছে!', '1.1'),
            ('RongTuli APK 1.1 (নতুন)', '1.1'), ('Rong Tuli version 1.1', '1.1'),
            ('RongTuli\nনতুন ফ্রেম\nRongTuli-1.1.apk', '1.1'), ('রংতুলি ১.১', '1.1'),
            ('RongTuli 0.10', '0.10'),
        ]
        for caption, want in cases:
            html = '<div class="tgme_widget_message_text">' + caption.replace('\n', '<br/>') + '</div>'
            got = await p.evaluate("(h => TgNews.read(TgNews.posts(h)[0]))" + "(" + json.dumps(html) + ")")
            check('caption read: ' + repr(caption[:34]), got and got.get('version') == want, got)
        for caption in ['আজ ছুটির দিন, সবাই ভালো থাকুন', 'RongTuli অ্যাপটা ভালো লাগছে?', 'PicsArt 1.1 আপডেট']:
            html = '<div class="tgme_widget_message_text">' + caption + '</div>'
            got = await p.evaluate("(h => TgNews.read(TgNews.posts(h)[0]))" + "(" + json.dumps(html) + ")")
            check('not news: ' + repr(caption[:30]), got is None, got)
        check('0.10 is newer than 0.9, 0.8 is not', await p.evaluate("[TgNews.newer('0.10','0.9'), TgNews.newer('0.8','0.9')]") == [True, False])

        # ---------- the blocking card ----------
        await p.evaluate(FAKE + "(" + json.dumps(PAGE) + ")")
        await p.evaluate("TgNews.check(true)")
        await p.wait_for_timeout(600)
        check('a newer post opens the card by itself', await p.evaluate("!!document.querySelector('#verwrap')"))
        check('there is exactly ONE button, and it says Download Now',
              await p.evaluate("[...document.querySelectorAll('#verwrap button, #verwrap [role=button]')].map(b => b.textContent.toUpperCase())") == ['DOWNLOAD NOW'])
        vtxt = await p.evaluate("document.querySelector('.vercard').innerText")
        check('it is in English, with the version posted, the app logo and the @name',
              'A new version of RongTuli is here!' in vtxt and 'Version 9.11' in vtxt and '@rongtuli_app' in vtxt
              and await p.evaluate("!!document.querySelector('.ver-logo svg')"), vtxt)
        check('the note is not printed twice', vtxt.count('Faster Remove') == 1, vtxt)
        check('the page behind cannot be scrolled or tapped', await p.evaluate("document.body.classList.contains('locked')"))
        await s.shot('alert_card')

        # Back: first press = hint only (card stays), second press = leave the app
        await p.evaluate("window.rtBack()")
        await p.wait_for_timeout(250)
        toast = await p.evaluate("(() => { const t = document.querySelector('#toast'); return t ? t.textContent : ''; })()")
        check('the first Back only says "press again to exit"', 'again' in toast.lower(), toast)
        check('…and the card is still there', await p.evaluate("!!document.querySelector('#verwrap')"))
        quit_called = await p.evaluate("(window.__q=0, window.RTAndroid={setLock(){}, quit(){window.__q=1}, openUrl(u){window.__u=u}}, 1)")
        await p.wait_for_timeout(2600)                     # after the hint has faded, Back is "first" again
        await p.evaluate("window.rtBack()"); await p.wait_for_timeout(200)
        check('a later Back is the first press again (hint, no exit)',
              await p.evaluate("window.__q") == 0 and await p.evaluate("!!document.querySelector('#verwrap')"))
        await p.evaluate("window.rtBack()"); await p.wait_for_timeout(200)
        check('two quick presses leave the app', await p.evaluate("window.__q") == 1)
        check('and the card never let the app behind it be used', await p.evaluate("!!document.querySelector('#verwrap')"))

        # Download Now → the owner's link
        await p.evaluate("window.__u = ''")
        await p.click('#ver-go'); await p.wait_for_timeout(200)
        check('Download Now opens the posted link', await p.evaluate("window.__u") == 'https://t.me/rongtuli_app/12',
              await p.evaluate("window.__u"))
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok:
        sys.exit(1)

asyncio.run(main())
