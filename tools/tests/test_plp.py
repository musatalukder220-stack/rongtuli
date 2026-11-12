"""PixelLab .plp files: the four samples in tools/samples open, look like PixelLab's own preview picture, and survive being
saved as a RongTuli project. Also: files that are not projects."""
import asyncio, base64, io, json, os, sys, zipfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from pw_common import *
from PIL import Image, ImageChops, ImageFilter, ImageStat

SAMPLES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'samples')
#        name: (width, height, layers, texts, worst allowed difference from PixelLab's preview, words expected in the notes)
EXPECT = {
    'p07': (1000, 1280, 12, 8, 5.0, None),             # uses fonts built into PixelLab that the app also carries (Neuton, Amaranth)
    'p14': (900, 1280, 25, 10, 4.5, 'Blackout'),
    'p15': (1280, 1280, 14, 7, 3.0, None),
    'p17': (3264, 3264, 19, 10, 6.0, 'icon fonts'),      # the file's own size (a project is not shrunk any more)
}
INFO = """(() => ({w: RT.Doc.width, h: RT.Doc.height, n: RT.Doc.layers.length, texts: RT.Doc.layers.filter(l => l.type === 'text').length, name: RT.Doc.name, pid: RT.Doc.pid,
    notes: Array.from(document.querySelectorAll('.notes li')).map(e => e.textContent).join(' | '),
    fonts: Array.from(new Set(RT.Doc.layers.filter(l => l.type === 'text').flatMap(l => [l.font].concat((l.spans || []).map(q => q.font).filter(Boolean))))).sort(),
    lines: RT.Doc.layers.filter(l => l.type === 'text').map(l => RT.TextRender.layout(l).lines.length)}))()"""

async def picture(p, size=384):
    url = await p.evaluate("RT.Doc.flatten({maxDim: %d, fill: '#ffffff'}).toDataURL('image/png')" % size)
    return Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB')
def differ(a, b):
    b = b.resize(a.size, Image.LANCZOS)
    d = ImageStat.Stat(ImageChops.difference(a.filter(ImageFilter.GaussianBlur(3)), b.filter(ImageFilter.GaussianBlur(3)))).mean
    return sum(d) / 3
async def pick(p, path):
    async with p.expect_file_chooser() as fc:
        await p.click('#btn-plp')
    await (await fc.value).set_files(path)

async def main():
    ok = True
    def check(label, cond, extra=''):
        nonlocal ok
        print(('  ok   ' if cond else '  FAIL ') + label, extra)
        if not cond: ok = False
    async with Session(390, 844, 1, True) as s:
        p = s.page
        await s.open()
        await p.evaluate("indexedDB.deleteDatabase('rongtuli')")
        shots = {}
        for name, (W, H, n, texts, worst, word) in EXPECT.items():
            path = os.path.join(SAMPLES, name + '.plp')
            await s.open()
            await pick(p, path)
            await p.wait_for_function("RT.Doc.open", timeout=60000); await p.wait_for_timeout(500)
            info = await p.evaluate(INFO)
            mine = await picture(p); shots[name] = mine
            thumb = Image.open(io.BytesIO(zipfile.ZipFile(path).read('thumb'))).convert('RGB')
            d = differ(mine, thumb)
            print('%s: %dx%d, %d layers (%d texts), differs from PixelLab by %.1f | %s' % (name, info['w'], info['h'], info['n'], info['texts'], d, info['notes'][:110]))
            check(name + ' size and layers', (info['w'], info['h'], info['n'], info['texts']) == (W, H, n, texts))
            check(name + ' looks like PixelLab', d <= worst, '%.1f (allowed %.1f)' % (d, worst))
            check(name + ' notes', (word in info['notes']) if word else info['notes'] == '', info['notes'][:80] if word else '')
            check(name + ' named after the file, not saved yet', info['name'] == name and info['pid'] is None)
            if await p.locator('#btn-plp-ok').count(): await p.click('#btn-plp-ok')
            if name == 'p17':
                # 16 dots in a box that fits 8: PixelLab cuts the "word", 2 lines become 4
                dots = await p.evaluate("RT.Doc.layers.filter(l => l.type === 'text' && /^\\.+\\n\\.+$/.test(l.text)).map(l => [Math.round(l.wrap), RT.TextRender.layout(l).lines.map(q => q.runs.map(r => r.s).join('').length)])")
                check('p17 a long word is cut to fit', [x[1] for x in dots] == [[8, 8, 8, 8], [16, 16]], str(dots))
                multi = await p.evaluate("RT.Doc.layers.filter(l => l.type === 'text' && l.spans && l.spans.some(q => q.color)).length")
                check('p17 texts with several colours', multi >= 1, str(multi))
            if name == 'p07':
                check('p07 PixelLab\'s own fonts are the real ones', info['fonts'] == ['Amaranth', 'Neuton'] or set(['Amaranth', 'Neuton']) <= set(info['fonts']), str(info['fonts']))
                # the title must sit above the black bar, as in PixelLab (its Neuton has other line measures than today's)
                y = await p.evaluate("(() => { const l = RT.Doc.layers.find(q => q.text === 'FASHION'), L = RT.TextRender.layout(l); return [Math.round(l.y - L.h / 2), Math.round(l.y + L.h / 2)]; })()")
                check('p07 title sits where PixelLab put it', abs((y[0] + y[1]) / 2 - 63.5) <= 4, str(y))      # 21 px lower with the measures of today's Neuton
                turned = await p.evaluate("RT.Doc.layers.filter(l => l.type === 'text' && Math.abs(l.rotation + Math.PI / 2) < 0.01).map(l => +l.opacity.toFixed(2))")
                check('p07 text turned -90° at 38%', turned == [0.38], str(turned))
            if name == 'p15':
                # (fonts of earlier files stay in the list now, so count only the ones this file brought)
                names = await p.evaluate("RT.Fonts.list.filter(f => f.group === 'my').map(f => f.label)")
                check('p15 fonts are listed under their real names', len(names) >= 5 and not any(n.startswith('PLP font') for n in names), str(names))
                pill = await p.evaluate("RT.Doc.layers.filter(l => l.type === 'text' && l.bg.on).map(l => [l.text, Math.round(l.bg.radius)])")
                check('p15 pill-shaped highlight', len(pill) == 1 and pill[0][1] >= 90, str(pill))

        # ---- the same file through our own unpacker (browsers without DecompressionStream) ----
        await s.open()
        await p.evaluate("void (RT.Zip.native = false)")
        await pick(p, os.path.join(SAMPLES, 'p15.plp'))
        await p.wait_for_function("RT.Doc.open", timeout=60000); await p.wait_for_timeout(500)
        d = differ(await picture(p), shots['p15'])
        check('own unpacker gives the same picture', d < 0.05, '%.3f' % d)

        # ---- a PLP saved as a project comes back after the page is loaded again, with its fonts ----
        before = await p.evaluate(INFO)
        saved = await p.evaluate("RT.Folders.saveAs('From PixelLab', '')")
        await s.open()
        # the fonts that came inside the .plp are kept on purpose (Text → Font lists them for later texts)
        kept = await p.evaluate("Object.keys(RT.Fonts.custom).length")
        check('fonts of the PLP stay in the font list after the page is loaded again', kept >= 5, str(kept))
        await p.click('#btn-folders'); await p.wait_for_selector('.pj'); await p.click('.pj-open')
        await p.wait_for_function("RT.Doc.open && RT.Doc.pid", timeout=30000); await p.wait_for_timeout(600)
        after = await p.evaluate(INFO)
        d = differ(await picture(p), shots['p15'])
        only = lambda f: [x for x in f if 'Metropolis' in x or 'LEMON' in x]      # (the fonts this file uses)
        check('project of a PLP: same layers, fonts, line breaks', saved and (after['n'], after['texts'], after['lines']) == (before['n'], before['texts'], before['lines']) and only(after['fonts']) == only(before['fonts']), 'before %s | after %s' % (before['fonts'], after['fonts']))
        check('project of a PLP: same picture', d < 0.6, '%.2f' % d)
        await s.top('Close'); await p.wait_for_timeout(500)

        # ---- files that are not projects ----
        await pick(p, '/home/user/uploads/IMG_20261111_091333.jpg')
        await p.wait_for_function("RT.Doc.open", timeout=20000); await p.wait_for_timeout(300)
        st = await s.state()
        check('a photo picked as a "project" simply opens as a photo', st['n'] == 1 and (st['w'], st['h']) == (844, 812), str(st['layers']))
        await s.top('Close'); await p.wait_for_timeout(400)
        os.makedirs('/tmp/shots', exist_ok=True)
        open('/tmp/shots/not_a_project.txt', 'w').write('hello, this is only some text\n' * 20)
        await pick(p, '/tmp/shots/not_a_project.txt'); await p.wait_for_timeout(900)
        t1 = await p.inner_text('#toast')
        check('a text file is refused with a clear message', not await p.evaluate("RT.Doc.open") and 'not a project file' in t1, t1[:90])
        with zipfile.ZipFile('/tmp/shots/other.zip', 'w') as z: z.writestr('readme.txt', 'nothing useful')
        await pick(p, '/tmp/shots/other.zip'); await p.wait_for_timeout(900)
        t2 = await p.inner_text('#toast')
        check('another zip is refused with a clear message', not await p.evaluate("RT.Doc.open") and 'not a project' in t2, t2[:100])
        raw = open(os.path.join(SAMPLES, 'p15.plp'), 'rb').read()
        open('/tmp/shots/cut.plp', 'wb').write(raw[:len(raw) // 2])
        await pick(p, '/tmp/shots/cut.plp'); await p.wait_for_timeout(900)
        t3 = await p.inner_text('#toast')
        check('a file cut in half is refused, the app stays usable', not await p.evaluate("RT.Doc.open") and 'incomplete' in t3 and await p.is_visible('#btn-open'), t3[:100])
        s.errors = [e for e in s.errors if 'willReadFrequently' not in e and 'is incomplete' not in e and 'not a project' not in e and 'neither a PixelLab' not in e]
        s.report()
    print('RESULT', 'ok' if ok else 'FAILED')
    if not ok: sys.exit(1)
asyncio.run(main())
