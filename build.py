#!/usr/bin/env python3
"""Build RongTuli into ONE self-contained file: app/index.html

    cd /home/user/rongtuli && python3 build.py

What it does
  * joins src/js/*.js (in file-name order) and src/styles.css into src/index.html
  * embeds every font listed in src/fonts/manifest.json (base64), so the app
    needs no internet connection and works when the file is opened directly
  * copies the "install on home screen" files (manifest, icons, service worker)
    from src/pwa/ next to it, if that folder exists

The output folder is called "app" on purpose (not build/ or dist/).
"""
import base64
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "app"


def main() -> int:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "styles.css").read_text(encoding="utf-8")

    parts = []
    for f in sorted((SRC / "js").glob("*.js")):
        parts.append(f"/* ---- {f.name} ---- */\n" + f.read_text(encoding="utf-8"))
    js = "\n".join(parts)
    if "</script" in js.lower():
        print("ERROR: a JS file contains '</script', which would break the page", file=sys.stderr)
        return 1

    fonts = []
    total = 0
    manifest = SRC / "fonts" / "manifest.json"
    if manifest.exists():
        for m in json.loads(manifest.read_text(encoding="utf-8")):
            data = (SRC / "fonts" / m["file"]).read_bytes()
            total += len(data)
            fonts.append({
                "family": m["family"], "weight": str(m["weight"]), "style": m.get("style", "normal"),
                "range": m.get("range") or "U+0-10FFFF", "data": base64.b64encode(data).decode("ascii"),
            })
    font_js = "window.FONT_DATA = " + json.dumps(fonts, separators=(",", ":")) + ";"

    page = SRC / "update.html"                  # the small page the app opens for an update (it links to Telegram)
    if page.exists():
        import re
        m = re.search(r"Updater\.CHANNEL\s*=\s*'([^']*)'", (SRC / "js" / "21-update.js").read_text(encoding="utf-8"))
        channel = m.group(1) if m else ""
        settings = "window.RT_SETTINGS = { channel: %s };" % json.dumps(channel)
        page_js = page.read_text(encoding="utf-8").replace("/*JS*/", settings)
        (OUT / "update.html").write_text(page_js, encoding="utf-8")

    pwa = SRC / "pwa"
    has_pwa = (pwa / "manifest.webmanifest").exists()
    head = ('<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-192.png">'
            if has_pwa else "")

    for token in ("/*CSS*/", "/*JS*/", "/*FONTS*/", "<!--MANIFEST-->"):
        if html.count(token) != 1:
            print(f"ERROR: src/index.html must contain {token} exactly once", file=sys.stderr)
            return 1
    html = (html.replace("<!--MANIFEST-->", head).replace("/*CSS*/", css)
                .replace("/*FONTS*/", font_js).replace("/*JS*/", js))

    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(html, encoding="utf-8")
    if has_pwa:
        version = time.strftime("%Y%m%d%H%M%S")
        for f in pwa.iterdir():
            if f.name == "sw.js":
                (OUT / "sw.js").write_text(f.read_text(encoding="utf-8").replace("__VERSION__", version), encoding="utf-8")
            elif f.is_file():
                shutil.copy2(f, OUT / f.name)

    # the AI add-on: our own script is copied; the big engine and model files are fetched once by tools/fetch_ai.py
    ai_src, ai_out = SRC / "ai", OUT / "ai"
    ai = "no"
    if ai_src.exists():
        ai_out.mkdir(exist_ok=True)
        for f in ai_src.iterdir():
            if f.is_file():
                shutil.copy2(f, ai_out / f.name)
        need = ["ort.wasm.min.js", "ort-wasm-simd.wasm", "u2netp.onnx", "modnet.onnx"]
        have = all((ai_out / n).exists() for n in need)
        (ai_out / "manifest.json").write_text(json.dumps({
            "ready": have, "files": {n: (ai_out / n).stat().st_size for n in need if (ai_out / n).exists()},
        }), encoding="utf-8")
        ai = "yes" if have else "script only (run tools/fetch_ai.py for the models)"

    size = (OUT / "index.html").stat().st_size
    print(f"app/index.html  {size / 1024:.0f} KB  (js {len(js) / 1024:.0f} KB, css {len(css) / 1024:.0f} KB, "
          f"{len(fonts)} font files {total / 1024:.0f} KB, pwa files: {'yes' if has_pwa else 'no'}, AI add-on: {ai})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
