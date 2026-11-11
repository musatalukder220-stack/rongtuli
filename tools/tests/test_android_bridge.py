"""The page as it runs inside the Android app, played in Chromium:
   - every file is answered from app/ under https://appassets.androidplatform.net (as MainActivity.java does, same headers)
   - a stand-in for the object "RTAndroid" records what the page hands over for saving and sharing
The Java side itself cannot be run here; this checks the page's half of the bargain."""
import asyncio, base64, io, json, os, sys
from urllib.parse import urlparse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APPDIR = os.path.join(ROOT, 'app')
ORIGIN = 'https://appassets.androidplatform.net'
MIME = [('.html', 'text/html'), ('.js', 'text/javascript'), ('.css', 'text/css'), ('.json', 'application/json'), ('.webmanifest', 'application/json'),
        ('.wasm', 'application/wasm'), ('.png', 'image/png'), ('.jpg', 'image/jpeg'), ('.svg', 'image/svg+xml'), ('.txt', 'text/plain')]
FAKE = """
window.__saved = []; window.__shared = []; window.__jobs = {};
window.RTAndroid = {
  _n: 0,
  begin: function (name, type) { var id = ++this._n; window.__jobs[id] = { name: name, type: type, parts: [] }; return id; },
  chunk: function (id, b64) { var j = window.__jobs[id]; if (!j) return false; j.parts.push(b64); return true; },
  save: function (id) { var j = window.__jobs[id]; if (!j) return '!The file was lost on the way'; window.__saved.push(j);
    return 'look in ' + (j.type.indexOf('image/') === 0 ? 'Pictures' : 'Download') + ' \\u203a RongTuli'; },
  share: function (id) { var j = window.__jobs[id]; if (!j) return false; window.__shared.push(j); return true; },
  info: function () { return JSON.stringify({ app: 'test', sdk: 34, webview: '120.0' }); }
};
"""
def joined(job):
    return b''.join(base64.b64decode(p) for p in job['parts'])

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    asked, outside = [], []
    async def serve(route, request):
        u = urlparse(request.url)
        if u.scheme + '://' + u.netloc != ORIGIN:
            outside.append(request.url); await route.fulfill(status=403, body=b''); return
        path = u.path if u.path not in ('', '/') else '/index.html'
        asked.append(path)
        f = os.path.join(APPDIR, path.lstrip('/'))
        if '..' in path or path == '/sw.js' or not os.path.isfile(f):            # the APK carries no service worker
            await route.fulfill(status=404, body=b''); return
        kind = next((m for e, m in MIME if path.lower().endswith(e)), 'application/octet-stream')
        with open(f, 'rb') as fh:
            await route.fulfill(status=200, body=fh.read(), headers={'Content-Type': kind, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'})

    async with Session() as s:
        p = s.page
        await p.context.route('**/*', serve)
        await p.add_init_script(FAKE)
        await p.goto(ORIGIN + '/index.html')
        await p.wait_for_function("window.RT && RT.Fonts.list.length > 4", timeout=20000)
        foot = await p.evaluate("document.querySelector('.home-foot').textContent")
        check('the page knows it is inside the Android app', 'Android app' in foot and await p.evaluate("Native.on"), foot)
        await p.wait_for_timeout(800)
        check('no service worker is asked for', '/sw.js' not in asked and await p.evaluate("navigator.serviceWorker.getRegistration().then(r => !r)"), str([a for a in asked if 'sw' in a]))
        check('projects can be kept on the phone here (IndexedDB)', await p.evaluate("RT.Store.persistent") is True)

        # ---- save the picture ----
        await p.click('#btn-demo'); await p.wait_for_selector('#toolbar .tb-item'); await p.wait_for_timeout(400)
        await s.top('Save picture')
        await p.wait_for_function("window.__saved.length === 1", timeout=20000); await p.wait_for_timeout(300)
        job = await p.evaluate("window.__saved[0]")
        data = joined(job)
        im = Image.open(io.BytesIO(data))
        doc = await p.evaluate("[RT.Doc.width, RT.Doc.height]")
        check('the picture arrives whole, as a JPG with its name', job['type'] == 'image/jpeg' and job['name'].endswith('.jpg') and data[:2] == b'\xff\xd8' and data[-2:] == b'\xff\xd9' and list(im.size) == doc, '%s %s %d bytes %s' % (job['name'], job['type'], len(data), im.size))
        check('in pieces of whole base64', all(len(x) % 4 == 0 for x in job['parts']) and all(len(x) == 262144 for x in job['parts'][:-1]), str([len(x) for x in job['parts']][:4]))
        toast = await p.evaluate("(document.querySelector('#toast') || {}).textContent")
        check('the message says where it went', 'Pictures' in (toast or '') and 'RongTuli' in toast and 'Downloads' not in toast, toast)

        # ---- the Save sheet: PNG + Share ----
        await p.evaluate("Exporter.open('png')"); await p.wait_for_selector('#btn-share:not([disabled])', timeout=20000)
        hint = await p.evaluate("document.querySelector('.ex-hint').textContent")
        check('the sheet explains where saved pictures go', 'gallery' in hint, hint)
        await p.click('#btn-share'); await p.wait_for_function("window.__shared.length === 1", timeout=20000)
        sj = await p.evaluate("window.__shared[0]"); sd = joined(sj)
        check('Share hands over the PNG, joined from several pieces', sj['type'] == 'image/png' and sj['name'].endswith('.png') and sd[:8] == b'\x89PNG\r\n\x1a\n' and len(sj['parts']) > 1
              and all(len(x) == 262144 for x in sj['parts'][:-1]) and list(Image.open(io.BytesIO(sd)).size) == doc, '%s %d bytes in %d pieces' % (sj['name'], len(sd), len(sj['parts'])))
        await p.click('#btn-save'); await p.wait_for_function("window.__saved.length === 2", timeout=20000)
        await p.click('.sheet .sheet-h button[title="Close"]'); await p.wait_for_timeout(300)

        # ---- a project file ----
        await p.evaluate("TextTool.add && void 0")
        await p.evaluate("Folders.exportOpen('download')")
        await p.wait_for_function("window.__saved.length === 3", timeout=30000); await p.wait_for_timeout(300)
        pj = await p.evaluate("window.__saved[2]"); pd = joined(pj)
        toast = await p.evaluate("(document.querySelector('#toast') || {}).textContent")
        check('a project file goes to Download with its own ending', pj['name'].endswith('.rongtuli') and pj['type'] == 'application/octet-stream' and pd[:2] == b'PK' and 'Download' in (toast or ''), '%s %s %d bytes | %s' % (pj['name'], pj['type'], len(pd), toast))
        await p.evaluate("Folders.exportOpen('share')"); await p.wait_for_function("window.__shared.length === 2", timeout=30000)
        check('and can be shared', (await p.evaluate("window.__shared[1].name")).endswith('.rongtuli'))

        # ---- a save that the phone refuses ----
        await p.evaluate("RTAndroid.save = function () { return '!Allow the app to save files when the phone asks, then press Save again'; }")
        await s.top('Save picture'); await p.wait_for_timeout(1500)
        toast = await p.evaluate("(document.querySelector('#toast') || {}).textContent")
        check('a refusal is told in the phone’s words', 'press Save again' in (toast or ''), toast)
        s.errors = [e for e in s.errors if 'save:' not in e]            # the page notes the refusal as a warning

        # ---- the AI add-on from the same address ----
        if os.path.exists(os.path.join(APPDIR, 'ai', 'modnet.onnx')):
            check('the AI add-on is found', await p.evaluate("RT.AICut.check()") is True)
            r = await p.evaluate("(async () => { const c = RT.UI.demoCanvas(); const r = await RT.AICut.cut({ canvas: c, key: 'k1', mode: 'auto' }); return { n: r.alpha.length, want: c.width * c.height, pick: r.pick, how: RT.AICut.mode() }; })()")
            check('and runs (in a worker)', r['n'] == r['want'] and r['how'] == 'worker', str(r))
            check('its files came from the app itself', all(('/ai/' + n) in asked for n in ('rtai.js', 'ort.wasm.min.js', 'ort-wasm-simd.wasm', 'u2netp.onnx', 'modnet.onnx')), str(sorted(set(a for a in asked if a.startswith('/ai/')))))
        check('nothing was asked from any other address', not outside, str(outside[:3]))
        s.errors = [e for e in s.errors if 'Canvas2D' not in e]
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
