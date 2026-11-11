"""Open PixelLab .plp files in the app (headless browser) and put our picture next to PixelLab's own thumbnail.

    python3 tools/plp_compare.py [folder with pNN.plp] [names…]     e.g.  python3 tools/plp_compare.py /tmp/plp/all p03 p17

Writes /tmp/plp/out/<name>.png (ours), <name>_cmp.png (PixelLab | ours) and sheet_N.png.
Get the sample files with tools/fetch_samples.py.
"""
import asyncio, base64, glob, io, json, os, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw_common import *
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/plp/all"
ONLY = sys.argv[2:]
OUT = "/tmp/plp/out"
SIZE = int(os.environ.get("CMP", "512"))

async def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(SRC + "/p*.plp"))
    if ONLY: files = [f for f in files if os.path.basename(f)[:-4] in ONLY]
    pairs = []
    async with Session(390, 844, 1, True) as s:
        p = s.page
        for f in files:
            name = os.path.basename(f)[:-4]
            await s.open()
            async with p.expect_file_chooser() as fc:
                await p.click("#btn-plp")
            await (await fc.value).set_files(f)
            try:
                await p.wait_for_function("RT.Doc.open", timeout=60000)
            except Exception as e:
                print(name, "FAILED TO OPEN", await p.evaluate("(document.querySelector('#toast')||{}).textContent")); continue
            await p.wait_for_timeout(400)
            info = await p.evaluate("""(() => ({w: RT.Doc.width, h: RT.Doc.height, n: RT.Doc.layers.length,
                text: RT.Doc.layers.filter(l => l.type === 'text').length,
                notes: Array.from(document.querySelectorAll('.notes li')).map(e => e.textContent),
                head: (document.querySelector('.notes-h') || document.querySelector('#toast') || {}).textContent,
                mb: Math.round(RT.Doc.layers.reduce((a, l) => a + (l.bitmap ? l.bitmap.width * l.bitmap.height * 4 : 0), 0) / 1e6)}))()""")
            url = await p.evaluate("RT.Doc.flatten({maxDim: %d, fill: '#ffffff'}).toDataURL('image/png')" % SIZE)
            mine = Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")
            mine.save("%s/%s.png" % (OUT, name))
            th = Image.open(io.BytesIO(zipfile.ZipFile(f).read("thumb"))).convert("RGB").resize(mine.size, Image.LANCZOS)
            ref = "%s/%s_ref.jpg" % (SRC, name)
            cmp_ = Image.new("RGB", (mine.width * 2 + 6, mine.height), (30, 30, 30))
            cmp_.paste(th, (0, 0)); cmp_.paste(mine, (mine.width + 6, 0))
            cmp_.save("%s/%s_cmp.png" % (OUT, name))
            pairs.append((name, cmp_))
            # how close are we? mean absolute difference per channel after a small blur (0 = same, 255 = opposite)
            from PIL import ImageChops, ImageFilter, ImageStat
            d = ImageStat.Stat(ImageChops.difference(th.filter(ImageFilter.GaussianBlur(3)), mine.filter(ImageFilter.GaussianBlur(3)))).mean
            print("%s %dx%d layers=%d (%d text) %dMB diff=%.1f | %s" % (name, info["w"], info["h"], info["n"], info["text"], info["mb"], sum(d) / 3, info["head"]))
            for n in info["notes"]: print("      -", n[:150])
        s.errors = [e for e in s.errors if "willReadFrequently" not in e]
        s.report()
    # sheets of 3 comparisons per row, 2 rows
    per = 6
    for i in range(0, len(pairs), per):
        chunk = pairs[i:i + per]
        cw = max(c.width for _, c in chunk); chh = max(c.height for _, c in chunk)
        cols = 2; rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * (cw + 10), rows * (chh + 10)), (10, 10, 10))
        for j, (n, c) in enumerate(chunk):
            sheet.paste(c, ((j % cols) * (cw + 10) + 5, (j // cols) * (chh + 10) + 5))
        sheet.save("%s/sheet_%d.png" % (OUT, i // per + 1))
        print("sheet", "%s/sheet_%d.png" % (OUT, i // per + 1), sheet.size, [n for n, _ in chunk])
asyncio.run(main())
