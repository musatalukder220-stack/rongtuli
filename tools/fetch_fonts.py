#!/usr/bin/env python3
"""Download a small set of open-licensed (OFL) fonts from Google Fonts as WOFF2 subsets.
Output: src/fonts/*.woff2 + src/fonts/manifest.json (embedded into the app by build.py)."""
import re, json, os, urllib.request, urllib.parse, hashlib

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "fonts")

# (family, weight, group, subsets to keep)
FONTS = [
    ("Poppins", 400, "en"), ("Poppins", 700, "en"),
    ("Bebas Neue", 400, "en"), ("Anton", 400, "en"), ("Oswald", 500, "en"),
    ("Playfair Display", 700, "en"), ("Abril Fatface", 400, "en"), ("Cinzel", 700, "en"),
    ("Pacifico", 400, "en"), ("Lobster", 400, "en"), ("Dancing Script", 700, "en"),
    ("Great Vibes", 400, "en"), ("Caveat", 700, "en"), ("Permanent Marker", 400, "en"),
    ("Bangers", 400, "en"), ("Righteous", 400, "en"),
    ("Neuton", 400, "en"), ("Amaranth", 400, "en"),          # two fonts built into PixelLab, so its projects look right
    ("Hind Siliguri", 400, "bn"), ("Hind Siliguri", 700, "bn"),
    ("Baloo Da 2", 700, "bn"), ("Galada", 400, "bn"), ("Atma", 600, "bn"),
    ("Noto Serif Bengali", 700, "bn"), ("Tiro Bangla", 400, "bn"), ("Mina", 700, "bn"),
]
KEEP = {"en": ["latin"], "bn": ["bengali", "latin"]}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

manifest = []
total = 0
for family, weight, group in FONTS:
    q = urllib.parse.quote_plus(family)
    try:
        css = get(f"https://fonts.googleapis.com/css2?family={q}:wght@{weight}&display=swap").decode("utf-8")
    except Exception as e:
        print("FAIL css", family, weight, e); continue
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
    for subset, body in blocks:
        if subset not in KEEP[group]:
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        rng = re.search(r"unicode-range:\s*([^;]+);", body).group(1).strip()
        style = re.search(r"font-style:\s*(\w+)", body).group(1)
        data = get(url)
        fn = f"{family.replace(' ', '')}-{weight}-{subset}.woff2"
        with open(os.path.join(OUT, fn), "wb") as f:
            f.write(data)
        total += len(data)
        manifest.append({"family": family, "weight": str(weight), "style": style, "group": group,
                         "subset": subset, "range": rng, "file": fn, "bytes": len(data)})
        print(f"{family:20s} {weight} {subset:8s} {len(data)/1024:7.1f} KB")
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)
print("TOTAL %.1f KB in %d files" % (total/1024, len(manifest)))
