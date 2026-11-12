"""Shared helpers for the browser tests (need: pip install playwright; playwright install chromium-headless-shell; sudo playwright install-deps chromium)."""
import asyncio, sys, os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "app" / "index.html").as_uri()
SHOTS = Path(os.environ.get("SHOTS", "/tmp/shots"))
SHOTS.mkdir(parents=True, exist_ok=True)

class Session:
    def __init__(self, w=390, h=844, dpr=2, touch=True):
        self.w, self.h, self.dpr, self.touch = w, h, dpr, touch
        self.errors = []
    async def __aenter__(self):
        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch()
        self.ctx = await self.browser.new_context(viewport={"width": self.w, "height": self.h}, device_scale_factor=self.dpr,
                                                  has_touch=self.touch, is_mobile=self.touch, accept_downloads=True)
        # a test never gets the "welcome / new version" cards in the way (test_alert.py deletes these keys itself)
        await self.ctx.add_init_script("""try {
          if (!localStorage.getItem('rt-test-boot')) {          // only the first load of a test (not after a reload)
            localStorage.setItem('rt-test-boot', '1');
            localStorage.setItem('rt-hello-off', '1');         // the welcome card
            localStorage.setItem('rt-intro-off', '1');         // the blocking new-version card
          }
        } catch (e) {}""")
        self.page = await self.ctx.new_page()
        self.page.on("console", lambda m: self.errors.append("console." + m.type + ": " + m.text) if m.type in ("error", "warning") else None)
        self.page.on("pageerror", lambda e: self.errors.append("PAGEERROR: " + str(e)))
        return self
    async def __aexit__(self, *a):
        await self.browser.close(); await self.pw.stop()
    async def open(self, query=""):
        await self.page.goto(APP + query)
        await self.page.wait_for_function("window.RT && RT.Fonts.list.length > 4", timeout=20000)
    async def shot(self, name):
        await self.page.wait_for_timeout(250)
        p = SHOTS / (name + ".png")
        await self.page.screenshot(path=str(p))
        return p
    async def tb(self, id_):
        """tap a bottom-toolbar item (scrolls it into view first)"""
        el = self.page.locator('#toolbar .tb-item[data-id="%s"]' % id_)
        await el.scroll_into_view_if_needed()
        await el.click()
    async def top(self, title):
        await self.page.locator('#topbar button[title="%s"]' % title).click()
    async def drag(self, x0, y0, x1, y1, steps=12):
        m = self.page.mouse
        await m.move(x0, y0); await m.down()
        for i in range(1, steps + 1):
            await m.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        await m.up()
    async def stage(self):
        return await self.page.evaluate("(() => { const r = document.querySelector('#view').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    async def state(self):
        return await self.page.evaluate("""(() => ({w: RT.Doc.width, h: RT.Doc.height, n: RT.Doc.layers.length, sel: RT.Doc.selectedId,
            hist: RT.History.states.length, idx: RT.History.idx, mode: RT.UI.mode() ? RT.UI.mode().title : null,
            layers: RT.Doc.layers.map(l => l.type + ':' + l.name + ':' + Math.round(l.x) + ',' + Math.round(l.y) + ':' + (l.bitmap ? l.bitmap.width + 'x' + l.bitmap.height : ''))}))()""")
    def report(self):
        if self.errors:
            print("ERRORS (%d):" % len(self.errors))
            for e in self.errors[:30]: print("   ", e[:400])
        else:
            print("no console errors")
