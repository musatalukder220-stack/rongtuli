import asyncio, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..'))
from pw_common import *
async def main():
    # ---------- served over http (like the live preview) ----------
    async with Session() as s:
        p = s.page
        resp = await p.goto('http://localhost:8000/')
        print('http status', resp.status, resp.headers.get('content-type'))
        await p.wait_for_function("window.RT && RT.Fonts.list.length > 4", timeout=20000)
        print('fonts loaded', await p.evaluate("RT.Fonts.list.length"), 'sandboxed?', await p.evaluate("RT.U.sandboxed()"))
        await p.wait_for_timeout(1500)
        print('service worker:', await p.evaluate("navigator.serviceWorker.getRegistration().then(r => r ? (r.active ? 'active' : 'registered') : 'none')"))
        man = await p.evaluate("fetch('manifest.webmanifest').then(r => r.json()).then(j => j.short_name + ' / ' + j.icons.length + ' icons')")
        print('manifest:', man)
        await p.click('#btn-demo'); await p.wait_for_timeout(400)
        async with p.expect_download() as dl:
            await s.top('Save picture')
        print('download over http:', (await dl.value).suggested_filename)
        s.report()
asyncio.run(main())
