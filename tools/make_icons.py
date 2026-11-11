"""Draw the app icons (src/pwa/icon-*.png) from the logo. Needs Playwright; run once:  python3 tools/make_icons.py"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parent.parent / "src" / "pwa"
GRAD = ('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/>'
        '<stop offset=".55" stop-color="#c04bf2"/><stop offset="1" stop-color="#6a5cff"/></linearGradient></defs>')
BRUSH = ('<path d="M18 44c6-1 9-5 10-10l5 5c-2 6-8 9-15 5z" fill="#fff"/><path d="M30 32L46 14c2-2 5 1 3 3L35 37z" fill="#fff"/>'
         '<circle cx="45" cy="45" r="4" fill="#fff" opacity=".85"/>')
ROUND = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{GRAD}<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>{BRUSH}</svg>'
# maskable: colour to every edge, drawing kept inside the middle 70 %
MASK = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{GRAD}<rect width="64" height="64" fill="url(#g)"/><g transform="translate(32 32) scale(.7) translate(-32 -30)">{BRUSH}</g></svg>'

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for name, svg, size in (("icon-192.png", ROUND, 192), ("icon-512.png", ROUND, 512), ("icon-maskable-512.png", MASK, 512)):
            page = await b.new_page(viewport={"width": size, "height": size})
            await page.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width={size} height={size} ")}</body></html>')
            await page.screenshot(path=str(OUT / name), omit_background=True)
            await page.close()
            print("wrote", OUT / name)
        await b.close()
asyncio.run(main())
