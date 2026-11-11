# Remove BG with AI (version 0.4)

"Remove BG → Auto" has two ways now:

| Way | Where it works | What it does |
|---|---|---|
| **AI** (chips AI / Person / Object) | Android app, and the web app when it is opened from a web address that also serves the folder `ai/` | two small neural networks find the person or thing; runs on the phone, nothing is uploaded |
| **Colour** | everywhere, also from a file opened directly | removes the colours found along the picture's edge (plain backgrounds only) |

## Parts
| File | Size | What | Licence |
|---|---|---|---|
| `app/ai/ort.wasm.min.js`, `ort-wasm-simd.wasm` | 0.1 + 10.6 MB | ONNX Runtime Web 1.17.3, runs the models in WebAssembly (one thread) | MIT |
| `app/ai/u2netp.onnx` | 4.6 MB | U²-Net small: the most striking thing in a picture ("Object") | Apache-2.0 |
| `app/ai/modnet.onnx` | 25.9 MB | MODNet portrait matting: people, with soft hair ("Person") | Apache-2.0 |
| `app/ai/rtai.js` (source: `src/ai/rtai.js`) | 14 KB | our code: runs the models, chooses, cleans the edge | – |
| `src/js/18b-aicut.js` | | the page side (`AICut`): prepares small copies of the picture, talks to the worker |

`python3 tools/fetch_ai.py` downloads the four big files into `app/ai/` (checked by size and SHA-256).
`build.py` copies `src/ai/*` there and writes `app/ai/manifest.json` (`ready: true` only when all files are present).
Without the folder the app behaves as before (Colour only).

## How a cut-out is made
1. The page draws the picture at 320 × 320 (for U²-Net), at "short side 512, both sides multiples of 32, long side ≤ 1024"
   (for MODNet), and keeps the brightness at ≤ 1024 px and at full size.
2. A Web Worker (`ai/rtai.js`) loads the engine and the models (first time only) and runs them.
   Where a worker cannot start, the same script runs on the page itself (`AICut.mode()` says which).
3. **AI (auto)** runs both models and takes the person model when it covers (nearly) everything the general model
   found (`missed ≤ 9 %` and overlap ≥ 0.6). Reason: on people MODNet is clearly better (hair), on things it leaves
   holes. "Person" and "Object" force one model; switching between them is instant, the answers are kept.
4. The small mask is cleaned of specks and fitted to the picture's real edges (guided filter, computed at ≤ 1024 px,
   applied at full size).
5. The result is one more step on the Cutout tool's mask: Undo takes it back, Erase / Restore / Draw around fix the rest.

## What was measured (this machine, headless Chromium, one thread)
* 16 test photos (people, hair, saree, group selfie, dog, cat, car, motorcycle, shoe, the user's night photo):
  in all 16 the automatic choice was the model whose result looked better to the eye (judged by the developer,
  not by a benchmark).
* About 3 s per photo for both models (first use adds the loading of 41 MB).
* **Not measured: a real phone.** Expect several times longer there.

## Limits
* Not perfect. Known misses in the test set: a car lost its roof ("Object" model), a cat kept a piece of cushion.
  Fine hair on a busy background stays a little soft. Use Restore / Erase afterwards.
* "Person" is for people; on things it leaves holes. "Object" picks the most striking thing, not always the one meant.
* Needs WebAssembly with SIMD (Chrome / Android System WebView 91 or newer). If the AI cannot start, the app says so
  and uses the Colour way.
* From a file opened directly (`file://`) browsers do not allow loading the models, so only Colour is offered.
* Better quality would need much bigger models (100 MB and more, too slow on a phone) or a paid online service.
