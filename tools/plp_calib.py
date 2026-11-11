"""Measure how far every text sits from where PixelLab drew it (the `thumb` inside the .plp).

    python3 tools/plp_calib.py [folder] [names…]

For every text: draw the project without it, draw the text alone, then slide the text until the
picture looks most like PixelLab's thumbnail. Prints the best slide (in PixelLab container px)
with the numbers of the font, to check ideas about PixelLab's text layout.
"""
import asyncio, base64, glob, io, json, os, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pw_common import *
from PIL import Image
import numpy as np
from fontTools.ttLib import TTFont

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/plp/all"
ONLY = sys.argv[2:]
STRETCH = 0
SS = 4                                      # we draw at SS × the thumbnail size
KIND = os.environ.get("KIND", "text")
JS = """async (S) => {
  const KIND = '__KIND__';
  const D = RT.Doc, L = D.layers, vis = L.map(l => l.visible), out = { w: D.width, h: D.height, texts: [] };
  const png = (c) => c.toDataURL('image/png');
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (l.type !== KIND || !vis[i] || l.base) continue;
    l.visible = false;
    const without = png(D.flatten({ maxDim: S, fill: '#ffffff' }));
    L.forEach((q, j) => { q.visible = j === i; });
    const bg = D.bg; D.bg = { type: 'none', color: '#ffffff' };
    const alone = png(D.flatten({ maxDim: S }));
    D.bg = bg; L.forEach((q, j) => { q.visible = vis[j]; });
    if (KIND === 'image') { out.texts.push({ text: l.name, size: 10, rot: l.rotation, x: l.x, y: l.y, w: l.bitmap.width * l.scaleX, h: l.bitmap.height * l.scaleY, lines: 1, opacity: l.opacity, without: without, alone: alone }); continue; }
    const T = RT.TextRender.layout(l);
    out.texts.push({ text: l.text, size: l.size, rot: l.rotation, x: l.x, y: l.y, w: T.w, h: T.h, lines: T.lines.length, opacity: l.opacity, font: l.font, without: without, alone: alone });
  }
  return out;
}"""
def img(url): return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGBA")).astype(np.float32)
def fm(data):
    f = TTFont(io.BytesIO(data), fontNumber=0); upm = f["head"].unitsPerEm; hh = f["hhea"]; os2 = f["OS/2"] if "OS/2" in f else None
    asc, desc = hh.ascent / upm, -hh.descent / upm
    if os2 is not None and os2.version != 0xFFFF and (os2.fsSelection & 0x80): asc, desc = os2.sTypoAscender / upm, -os2.sTypoDescender / upm
    return dict(name=f["name"].getDebugName(4), asc=asc, desc=desc, top=f["head"].yMax / upm, bot=-f["head"].yMin / upm)
ROBOTO = dict(name="(default) Roboto", asc=0.9277, desc=0.2441, top=1.0562, bot=0.2710)

def slide(t, T, kc):
    base = img(t["without"])[:, :, :3]; al = img(t["alone"])
    H, W = base.shape[:2]; H -= H % SS; W -= W % SS
    base = base[:H, :W]; al = al[:H, :W]
    a = al[:, :, 3:4] / 255.0
    ys, xs = np.nonzero(a[:, :, 0] > 0.05)
    if len(ys) < 40: return None
    R = 10 * SS                                              # search ± 10 thumbnail px
    y0, y1, x0, x1 = max(0, ys.min() - R), min(H, ys.max() + R + 1), max(0, xs.min() - R), min(W, xs.max() + R + 1)
    y0 -= y0 % SS; x0 -= x0 % SS; y1 += (-y1) % SS; x1 += (-x1) % SS; y1 = min(y1, H); x1 = min(x1, W)
    tb = T[y0 // SS:y1 // SS, x0 // SS:x1 // SS]
    bb = base[y0:y1, x0:x1]; ta = a[y0:y1, x0:x1]; tc = al[y0:y1, x0:x1, :3]
    def score(dx, dy):
        sa = np.roll(np.roll(ta, dy, 0), dx, 1); sc = np.roll(np.roll(tc, dy, 0), dx, 1)
        comp = bb * (1 - sa) + sc * sa
        hh, ww = comp.shape[:2]
        small = comp.reshape(hh // SS, SS, ww // SS, SS, 3).mean((1, 3))
        t2 = tb[:small.shape[0], :small.shape[1]]
        return float(((small[:t2.shape[0], :t2.shape[1]] - t2) ** 2).mean())
    best = None
    for dy in range(-R + SS, R - SS + 1, SS):
        for dx in range(-R + SS, R - SS + 1, SS):
            sc_ = score(dx, dy)
            if best is None or sc_ < best[0]: best = (sc_, dx, dy)
    _, bx, by = best
    for dy in range(by - 3, by + 4):
        for dx in range(bx - 3, bx + 4):
            sc_ = score(dx, dy)
            if sc_ < best[0]: best = (sc_, dx, dy)
    s0 = score(0, 0)
    gain = 1 - best[0] / s0 if s0 > 0 else 0
    # is the text wider or narrower than PixelLab's? slide its left and right halves on their own
    mid = (int(xs.min()) + int(xs.max())) // 2 - x0
    taL = ta.copy(); taL[:, mid:] = 0; taR = ta.copy(); taR[:, :mid] = 0
    def score2(dxl, dxr, dy):
        sl = np.roll(np.roll(taL, dy, 0), dxl, 1); sr = np.roll(np.roll(taR, dy, 0), dxr, 1)
        cl = np.roll(np.roll(tc, dy, 0), dxl, 1); cr = np.roll(np.roll(tc, dy, 0), dxr, 1)
        comp = bb * np.clip(1 - sl - sr, 0, 1) + cl * sl + cr * sr
        hh, ww = comp.shape[:2]
        small = comp.reshape(hh // SS, SS, ww // SS, SS, 3).mean((1, 3)); t2 = tb[:small.shape[0], :small.shape[1]]
        return float(((small[:t2.shape[0], :t2.shape[1]] - t2) ** 2).mean())
    bl = min(range(best[1] - 10, best[1] + 11), key=lambda d: score2(d, best[1], best[2]))
    br = min(range(best[1] - 10, best[1] + 11), key=lambda d: score2(bl, d, best[2]))
    global STRETCH
    STRETCH = (br - bl) * kc
    return best[1] * kc, best[2] * kc, gain, s0, (xs.max() - xs.min()) * kc

async def main():
    files = sorted(glob.glob(SRC + "/p*.plp"))
    if ONLY: files = [f for f in files if os.path.basename(f)[:-4] in ONLY]
    rows = []
    async with Session(390, 844, 1, True) as s:
        p = s.page
        for f in files:
            name = os.path.basename(f)[:-4]
            zf = zipfile.ZipFile(f); data = json.loads(zf.read("data.plab"))
            thumb = Image.open(io.BytesIO(zf.read("thumb"))).convert("RGB"); tw, th = thumb.size
            T = np.asarray(thumb).astype(np.float32)
            await s.open()
            async with p.expect_file_chooser() as fc: await p.click("#btn-plp")
            await (await fc.value).set_files(f)
            await p.wait_for_function("RT.Doc.open", timeout=60000)
            await p.wait_for_timeout(300)
            r = await p.evaluate(JS.replace('__KIND__', KIND), max(tw, th) * SS)
            if KIND == "image":
                cw = [o for o in data["objectsBundle"].values() if o.get("shapeOldContainerWidth")][0]["shapeOldContainerWidth"]; kc = cw / (tw * SS)
                for t in r["texts"]:
                    res = slide(t, T, kc)
                    if res: rows.append(dict(file=name, text=t["text"], w=t["w"] * cw / r["w"], h=t["h"] * cw / r["w"], rot=t["rot"], dx=res[0], dy=res[1], gain=res[2]))
                print(name, "done", len(r["texts"]), flush=True)
                continue
            objs = [data["objectsBundle"][i] for i in data["objectsIds"] if i.startswith("text") and str(data["objectsBundle"][i].get("textTextString") or "").strip() and not data["objectsBundle"][i].get("objectHidden")]
            ids = [i for i in data["objectsIds"] if i.startswith("text") and str(data["objectsBundle"][i].get("textTextString") or "").strip() and not data["objectsBundle"][i].get("objectHidden")]
            if len(objs) != len(r["texts"]):
                # some texts are hidden by the importer (icon fonts): pair the rest up in order
                pairs, j = [], 0
                for t in r["texts"]:
                    while j < len(objs) and objs[j]["textTextString"] != t["text"]: j += 1
                    if j >= len(objs): break
                    pairs.append((objs[j], ids[j], t)); j += 1
                if len(pairs) != len(r["texts"]): print(name, "texts cannot be paired", len(objs), len(r["texts"])); continue
            else: pairs = list(zip(objs, ids, r["texts"]))
            cw = objs[0]["shapeOldContainerWidth"]; kc = cw / (tw * SS)      # container px per drawn px
            for o, oid, t in pairs:
                assert o["textTextString"] == t["text"]
                fonts = [iv["textsIntervalsFont"] for iv in o["textTextFont"].values()]
                builtin = [x for x in fonts if "/res/" not in x]
                mets = []
                for x in fonts:
                    if "/res/" in x:
                        try: mets.append(fm(zf.read("/res/" + x.split("/")[-1])))
                        except Exception as e: mets.append(None)
                if not fonts: mets = [ROBOTO]
                res = slide(t, T, kc)
                if not res: continue
                best = (0, res[0] / kc, res[1] / kc); gain = res[2]; s0 = res[3]; wpx_ = res[4]
                rows.append(dict(file=name, id=oid, text=t["text"][:18].replace("\n", "|"), size=float(o["textTextSize"]), lines=t["lines"], nl=t["text"].count("\n") + 1,
                                 dx=best[1] * kc, dy=best[2] * kc, gain=gain, s0=s0, rot=float(o.get("textRotation") or 0), ls=float(o.get("textLineSpacing") or 0),
                                 bold=bool(o.get("textBold")), italic=bool(o.get("textItalic")),
                                 maxw=float(o.get("textMaxWidth") or -1), align=int(o.get("textAlignment") or 0) & 7, builtin=len(builtin), mets=mets,
                                 bg=bool(o.get("textBgEnabled")), pt=float(o.get("textBgPaddingTop") or 0), pl=float(o.get("textBgPaddingLeft") or 0), wpx=wpx_, stretch=STRETCH, letsp=float(o.get('textLetterSpacing') or 0)))
            print(name, "done", len(r["texts"]), flush=True)
    if KIND == "image":
        for r in rows: print("%-4s %-8s %6.0f x %-6.0f rot %5.2f  dx %6.1f dy %6.1f gain %.2f" % (r["file"], r["text"], r["w"], r["h"], r["rot"], r["dx"], r["dy"], r["gain"]))
        good = [r for r in rows if r["gain"] > 0.3 and abs(r["dx"]) < 15 and abs(r["dy"]) < 15]
        print("pictures with a clear answer:", len(good), " mean dx %.2f dy %.2f   median dx %.2f dy %.2f" % (np.mean([r["dx"] for r in good]), np.mean([r["dy"] for r in good]), np.median([r["dx"] for r in good]), np.median([r["dy"] for r in good])))
        return
    json.dump(rows, open("/tmp/plp/cal/rows.json", "w"), indent=0, default=str)
    print("%-4s %-7s %-19s %6s %2s %5s %6s %6s %5s | %6s %6s %5s %5s %s" % ("file", "id", "text", "size", "n", "lsp", "dx", "dy", "gain", "dy/sz", "wider", "width", "letSp", "font"))
    for r in rows:
        m = r["mets"][0] if r["mets"] and r["mets"][0] else None
        ba = (m["top"] - m["asc"]) if m else float("nan")
        flag = ("builtin " if r["builtin"] else "") + ("rot " if r["rot"] else "") + ("bg " if r["bg"] else "") + ("wrap%d " % r["maxw"] if r["maxw"] > 0 else "") + ("al%d " % r["align"] if r["align"] != 3 else "")
        print("%-4s %-7s %-19s %6.1f %2d %5.0f %6.1f %6.1f %5.2f | %6.3f %6.1f %5.0f %5.0f %s %s" % (r["file"], r["id"], r["text"], r["size"], r["lines"], r["ls"], r["dx"], r["dy"], r["gain"], r["dy"] / r["size"], r["stretch"], r["wpx"], r["letsp"], (m["name"] if m else "-"), flag))
asyncio.run(main())
