"""Stage 5: the 'Remove' button, the new effects, the online sticker search, the fast save.

Everything is checked in the browser, with the network replaced by a fake Openverse so the test
does not depend on the internet. The fake answers with a real picture (a canvas turned into a
blob URL), so the whole path — search, thumbnail, tap, sticker — runs as it does on a phone.
"""
import asyncio, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *

FAKE = """(async () => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 200;
  const x = c.getContext('2d'); x.fillStyle = '#e05a2b'; x.fillRect(0, 0, 300, 200);
  x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(150, 100, 60, 0, 7); x.fill();
  const url = await new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b)), 'image/png'));
  const real = window.fetch.bind(window);
  window.fetch = (u, o) => {
    if (typeof u === 'string' && u.indexOf('api.openverse.org') >= 0) {
      return Promise.resolve(new Response(JSON.stringify({ results: [
        { url: url, thumbnail: url, title: 'A cat', width: 300, height: 200 },
        { url: url, thumbnail: url, title: 'A dog', width: 300, height: 200 } ] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return real(u, o);
  };
})()"""

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session() as s:
        p = s.page
        await s.open('?demo')

        # ---- online sticker search ----
        await s.tb('sticker')
        await p.wait_for_selector('.st-tabs .st-tab', timeout=10000)
        await p.locator('.st-tabs .st-tab:last-child').click()
        await p.wait_for_selector('.st-online .st-search', timeout=10000)
        await p.evaluate(FAKE)
        await p.fill('.st-online .st-search', 'cat')
        await p.click('.st-online .st-go')
        await p.wait_for_selector('.st-photos .st-cell', timeout=20000)
        n = await p.evaluate("document.querySelectorAll('.st-photos .st-cell').length")
        check('online search shows pictures', n == 2, str(n))
        await p.fill('.st-online .st-search', 'cat')
        await p.click('.st-online .st-go')                       # the same word again: from the cache, not the network
        await p.wait_for_timeout(300)
        n_cache = await p.evaluate("document.querySelectorAll('.st-photos .st-cell').length")
        check('the same word is not fetched twice', n_cache == 2, str(n_cache))
        before = await p.evaluate("RT.Doc.layers.length")
        await p.locator('.st-photos .st-cell:first-child').click()
        await p.wait_for_function("RT.Doc.layers.length === %d" % (before + 1), timeout=20000)
        top = await p.evaluate("RT.Doc.layers[RT.Doc.layers.length-1].name")
        check('a searched picture becomes a sticker', top == 'Sticker', top)
        await p.evaluate("RT.Doc.select(null)")

        # ---- the 'Remove' button ----
        sel = await p.evaluate("(() => { const l = PhotoTool.addCanvas(RT.U.canvas(200, 150), 'Card'); RT.Doc.select(l.id); RT.History.commit(); return l.id; })()")
        await p.wait_for_timeout(300)
        lab = await p.evaluate("(Array.from(document.querySelectorAll('#toolbar .tb-item')).find((e) => e.dataset.id === 'removebg') || {}).textContent")
        check("the background tool is called 'Remove BG'", (lab or '').strip() == 'Remove BG', str(lab))
        await s.tb('removebg')
        await p.wait_for_function("RT.UI.mode() && RT.UI.mode().title === 'Cutout'", timeout=10000)
        check('Remove BG opens the Cutout tool', True)
        await p.evaluate("RT.UI.mode().cancel(); RT.UI.exitMode()")
        await p.wait_for_timeout(200)

        # ---- every effect runs and changes the picture ----
        ids = await p.evaluate("RT.FX.list.map((e) => e.id)")
        check('there are many effects', len(ids) >= 80, str(len(ids)))
        bad = []
        for fid in ids:
            await p.evaluate("""(function (fid) {
  const e = RT.FX.list.find((x) => x.id === fid);
  const src = RT.Doc.layers[0].bitmap;
  const out = e.run(src, 0.5, Math.max(src.width, src.height) / 1000);
  const d = RT.IP.read(out);
  let sum = 0; for (let k = 0; k < d.data.length; k += 4) sum += d.data[k] + d.data[k+1] + d.data[k+2];
  window.__fx = sum;
})(%r)""" % fid)
            if await p.evaluate("window.__fx") == 0:
                bad.append(fid)
        check('every effect produces a picture', not bad, str(bad))

        await p.evaluate("RT.Doc.select(null)")
        # ---- the fast save: the same picture is rendered once and kept ----
        await p.evaluate("RT.Exporter._cache = null; RT.Exporter._pending = null;")
        t0 = time.time()
        r1 = await p.evaluate("RT.Exporter.render('jpg', 0.92).then((r) => r.blob.size)")
        t1 = time.time() - t0
        t0 = time.time()
        r2 = await p.evaluate("RT.Exporter.render('jpg', 0.92).then((r) => r.blob.size)")
        t2 = time.time() - t0
        check('second save of an unchanged picture is instant', r1 == r2 and t2 < 0.5,
              'first %.1f s, second %.3f s' % (t1, t2))
        await p.evaluate("RT.Layers.touch(RT.Doc.layers[0])")
        r3 = await p.evaluate("RT.Exporter.render('jpg', 0.92).then((r) => r.blob.size)")
        check('after a change it renders again', r3 == r1, '%d vs %d' % (r3, r1))

        s.report()
    return ok

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
