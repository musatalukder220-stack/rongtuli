"""Draw the launcher icons of the Android app (android/res/mipmap-*) from the logo.
Needs Playwright; run once:  python3 tools/make_android_icons.py"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

RES = Path(__file__).resolve().parent.parent / "android" / "res"
GRAD = ('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/>'
        '<stop offset=".55" stop-color="#c04bf2"/><stop offset="1" stop-color="#6a5cff"/></linearGradient></defs>')
BRUSH = ('<path d="M18 44c6-1 9-5 10-10l5 5c-2 6-8 9-15 5z" fill="#fff"/><path d="M30 32L46 14c2-2 5 1 3 3L35 37z" fill="#fff"/>'
         '<circle cx="45" cy="45" r="4" fill="#fff" opacity=".85"/>')
SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
# older phones: the finished rounded icon
ROUND = f'{SVG}{GRAD}<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>{BRUSH}</svg>'
# Android 8 and newer cut the icon to their own shape: a background that fills everything + the drawing inside the middle 55 %
BACK = f'{SVG}{GRAD}<rect width="64" height="64" fill="url(#g)"/></svg>'
FRONT = f'{SVG}<g transform="translate(32 32) scale(.55) translate(-32 -30)">{BRUSH}</g></svg>'
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        async def draw(svg, size, path):
            path.parent.mkdir(parents=True, exist_ok=True)
            page = await b.new_page(viewport={"width": size, "height": size})
            await page.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width={size} height={size} ")}</body></html>')
            await page.screenshot(path=str(path), omit_background=True)
            await page.close()
            print("wrote", path.relative_to(RES.parent), size)
        for d, size in LEGACY.items():
            await draw(ROUND, size, RES / f"mipmap-{d}" / "ic_launcher.png")
        await draw(BACK, 432, RES / "mipmap-xxxhdpi" / "ic_launcher_bg.png")
        await draw(FRONT, 432, RES / "mipmap-xxxhdpi" / "ic_launcher_fg.png")
        await b.close()
    (RES / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
    (RES / "mipmap-anydpi-v26" / "ic_launcher.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_bg" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_fg" />\n'
        '</adaptive-icon>\n', encoding="utf-8")
    print("wrote mipmap-anydpi-v26/ic_launcher.xml")
asyncio.run(main())
