"""the update news straight from the Telegram channel (22-tg.js) — with the blocking card (24-forced.js)"""
import asyncio, json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

PAGE = '''<html><body>
<div class="tgme_widget_message_text js-message_text" dir="auto">RongTuli 0.9<br/>old version<br/><a href="https://old.example/x.apk">https://old.example/x.apk</a></div>
<div class="tgme_widget_message_text js-message_text" dir="auto">RongTuli 9.12<br/>Better Remove, new frames<br/><a href="https://www.mediafire.com/file/abc/RongTuli-9.12.apk" target="_blank">Download</a></div>
<div class="tgme_widget_message_text js-message_text" dir="auto">Hello everyone, a new frame pack is here.</div>
</body></html>'''

FAKE = """(html => { const real = window.fetch;
  window.fetch = async (u, o) => String(u).includes('t.me/s/')
    ? new Response(html, {status: 200, headers: {'content-type': 'text/html'}})
    : real(u, o); })"""


async def main():
    ok = True
    def check(name, cond, why=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + name + (('  ' + str(why)) if why and not cond else ''))
        ok = ok and bool(cond)

    async with Session() as s:
        p = s.page
        await p.goto('http://localhost:8000/')
        await p.wait_for_function('window.RT', timeout=20000)
        await p.evaluate("localStorage.clear()")

        check('the channel address is right', await p.evaluate("TgNews.url()") == 'https://t.me/s/rongtuli_app',
              await p.evaluate("TgNews.url()"))
        check('a channel name in any form is understood',
              await p.evaluate("[TgNews.channel(), (TgNews.channelId='https://t.me/abc_123', TgNews.channel()), (TgNews.channelId='@xyz_99', TgNews.channel())]") == ['rongtuli_app', 'abc_123', 'xyz_99'],
              await p.evaluate("[TgNews.channel()]"))
        await p.evaluate("TgNews.channelId = 'rongtuli_app'")

        # a post whose download is only a link behind the word "Download"
        await p.evaluate(FAKE + "(" + json.dumps(PAGE) + ")")
        got = await p.evaluate("TgNews.fetch().then(v => v || 'none')")
        check('the newest post is read (version, note, link behind a word)',
              got and got.get('version') == '9.12' and 'MediaFire' not in (got.get('note') or '')
              and got.get('link', '').startswith('https://www.mediafire.com/'), got)

        # a newer post brings the blocking card (only Download Now; see test_alert.py for its details)
        await p.evaluate("TgNews.check(true)")
        await p.wait_for_timeout(600)
        card = await p.evaluate("document.querySelector('.vercard') ? document.querySelector('.vercard').innerText : 'none'")
        check('the blocking card shows the version and the note',
              'Version 9.12' in card and 'Better Remove' in card, card)
        check('with a single button', await p.evaluate("[...document.querySelectorAll('#verwrap button')].map(b => b.textContent)") == ['Download Now'])
        await s.shot('tg_card')

        # a version that is not newer (or no channel) changes nothing
        await p.evaluate("localStorage.clear()")
        await p.evaluate(FAKE + "(" + json.dumps('<div class="tgme_widget_message_text">RongTuli " + await p.evaluate("APP_VERSION") + "<br/>same<br/>https://x.example/a.apk</div>') + ")")
        cur = await p.evaluate("APP_VERSION")
        same = await p.evaluate("(html => { const real = window.fetch; window.fetch = async (u, o) => String(u).includes('t.me/s/') ? new Response(html, {status: 200, headers: {'content-type': 'text/html'}}) : real(u, o); return TgNews.fetch(); })" + "(" + json.dumps('<div class="tgme_widget_message_text">RongTuli ' + str(cur) + '<br/>same<br/>https://x.example/a.apk</div>') + ")")
        news = await p.evaluate("TgNews.check(true).then(v => v || 'none')")
        check('the same version is read but not news',
              isinstance(same, dict) and same.get('version') == cur and news == 'none', '%s / %s' % (same, news))
        await p.evaluate("TgNews.channelId = 'your_channel'")
        check('an unset channel is ignored', await p.evaluate("TgNews.configured()") is False)
        await p.evaluate("TgNews.channelId = 'rongtuli_app'")
        await s.shot('tg_done')
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok:
        sys.exit(1)

asyncio.run(main())
