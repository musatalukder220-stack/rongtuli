#!/usr/bin/env python3
"""Download the AI add-on (the engine and the two models) into app/ai/.

    python3 tools/fetch_ai.py            # only what is missing
    python3 tools/fetch_ai.py --check    # only verify what is there

The files are big (41 MB together), so they are fetched once and kept in app/ai/;
build.py does not touch them.  Without them the app works, only "AI" in Remove BG is hidden.

  ort.wasm.min.js, ort-wasm-simd.wasm   ONNX Runtime Web 1.17.3 (MIT)          - runs the models in the browser
  u2netp.onnx                           U2-Net small, salient object (Apache-2.0) - things, animals, anything
  modnet.onnx                           MODNet portrait matting (Apache-2.0)      - people, with fine hair
"""
import hashlib, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'ai')
FILES = [
    # name, url, bytes, sha256
    ('ort.wasm.min.js', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.wasm.min.js', 145070, None),
    ('ort-wasm-simd.wasm', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort-wasm-simd.wasm', 10551547, None),
    ('u2netp.onnx', 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', 4574861, None),
    ('modnet.onnx', 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx', 25888640, None),
]
HASHES = {      # sha256 of the files this app was tested with
    'ort.wasm.min.js': '654435ead2d823e56d5893ec53be49f6ddb7e827096561aae63501071470cf23',
    'ort-wasm-simd.wasm': '6783fcd6647ce1b426a527c31412a9c40894552faa609e9c931b3239a3438071',
    'u2netp.onnx': '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    'modnet.onnx': '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9',
}

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()

def ok(path, size, digest):
    return os.path.exists(path) and os.path.getsize(path) == size and (not digest or sha(path) == digest)

def main():
    check = '--check' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    bad = 0
    for name, url, size, _ in FILES:
        path = os.path.join(OUT, name); digest = HASHES.get(name)
        if ok(path, size, digest):
            print('ok       %-20s %9d bytes' % (name, size)); continue
        if check:
            print('MISSING  %-20s' % name); bad += 1; continue
        print('fetching %-20s %s' % (name, url), flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (RongTuli build)'})
        with urllib.request.urlopen(req, timeout=600) as r, open(path + '.part', 'wb') as f:
            while True:
                block = r.read(1 << 20)
                if not block: break
                f.write(block)
        os.replace(path + '.part', path)
        if not ok(path, size, digest):
            print('WRONG    %-20s got %d bytes, sha256 %s' % (name, os.path.getsize(path), sha(path))); bad += 1
        else:
            print('ok       %-20s %9d bytes' % (name, size))
    if '--hashes' in sys.argv:
        for name, _, _, _ in FILES: print("    '%s': '%s'," % (name, sha(os.path.join(OUT, name))))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
