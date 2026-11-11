"""Download the PixelLab .plp sample projects used to develop / test the PLP importer.

    python3 tools/fetch_samples.py            ->  /tmp/plp/all/p01.plp ... p18.plp  (+ pNN_ref.jpg where the pack has a preview)

Source page: https://www.urdu-nigaar.com/blog/pixellab-plp-files-download/  (free templates).
The numbering is the alphabetical order of the download links, so it is stable.
Four small ones (p07, p14, p15, p17) are also kept in tools/samples/ so the tests run without internet.
"""
import io, os, re, sys, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor

PAGE = "https://www.urdu-nigaar.com/blog/pixellab-plp-files-download/"
UA = {"User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"}
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/plp/all"

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()

def is_plp(data):
    try:
        return any(i.filename.endswith("data.plab") for i in zipfile.ZipFile(io.BytesIO(data)).infolist())
    except Exception:
        return False

def main():
    os.makedirs(OUT, exist_ok=True)
    html = get(PAGE).decode("utf-8", "replace")
    links = sorted(set(re.findall(r'["\']([^"\']*downloads/plp/[^"\']+)["\']', html)))
    print(len(links), "links")
    with ThreadPoolExecutor(6) as ex:
        blobs = list(ex.map(lambda l: get("https://www.urdu-nigaar.com" + l), links))
    n = 0
    for link, data in zip(links, blobs):
        if is_plp(data):
            n += 1
            open(os.path.join(OUT, "p%02d.plp" % n), "wb").write(data)
            continue
        zf = zipfile.ZipFile(io.BytesIO(data))
        idx = None
        for i in zf.infolist():
            if not i.is_dir() and is_plp(zf.read(i)):
                n += 1; idx = n
                open(os.path.join(OUT, "p%02d.plp" % n), "wb").write(zf.read(i))
        for i in zf.infolist():
            if idx and i.filename.lower().endswith(".jpg"):
                open(os.path.join(OUT, "p%02d_ref.jpg" % idx), "wb").write(zf.read(i))
    print("wrote", n, "plp files to", OUT)

if __name__ == "__main__":
    main()
