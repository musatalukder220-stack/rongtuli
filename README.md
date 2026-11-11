# RongTuli (রংতুলি) – photo editor web app

A phone-first photo editor and designer that runs in the browser. Everything is in one file,
`app/index.html` (fonts included), so it also works offline and when the file is
opened directly on a phone.

## Folders
| Path | What it is |
|---|---|
| `src/index.html`, `src/styles.css`, `src/js/*.js` | The source code. JS files are joined in file-name order. |
| `src/fonts/` | Bundled fonts (WOFF2, from Google Fonts) + `manifest.json`. |
| `src/pwa/` | Home-screen install files: web manifest, icons, service worker. |
| `app/` | **Build output** – this is what gets served / shared. |
| `build.py` | Builds `app/` from `src/`. |
| `docs/plp-format.md` | What we learned about PixelLab's `.plp` files and how they are imported. |
| `docs/project-format.md` | Our own project file (`.rongtuli`) and how projects are kept on the phone. |
| `docs/ai-remove-bg.md` | Remove BG with AI: the models, how a cut-out is made, what was measured, limits. |
| `docs/android.md` | The Android app: install, what the wrapper does, build, signing key, Play Store. |
| `src/ai/` | Our script for the AI add-on (`rtai.js`). The big engine and model files live only in `app/ai/` (fetched by `tools/fetch_ai.py`). |
| `android/` | The Android wrapper (manifest, Java, icons, signing key) and the built `RongTuli-<version>.apk`. |
| `tools/` | See "Tools" below. |

## Commands
```bash
python3 build.py                                        # build app/index.html
python3 -m http.server 8000 --bind 0.0.0.0 --directory app   # run it
bash tools/run_tests.sh                                 # rebuild + run all browser tests (about 6 minutes)
python3 tools/fetch_ai.py                               # once: AI engine + models into app/ai (41 MB)
bash tools/setup_android_sdk.sh && bash tools/build_apk.sh   # the Android app -> android/RongTuli-<version>.apk
```
Tests need Playwright once per machine:
`pip install playwright && python3 -m playwright install chromium-headless-shell && sudo python3 -m playwright install-deps chromium`

`test_http.py`, `test_back_button.py`, `test_sandbox_iframe.py`, `test_ai_cutout.py` and a part of
`test_project_flows.py` expect the app on `http://localhost:8000`.

## Source map
| File | Contents |
|---|---|
| `00-util.js` | helpers: DOM builder `U.h`, canvas, files, colour, toast, busy spinner, event bus; `Native` (saving and sharing inside the Android app) |
| `01-icons.js` | all line icons + the logo |
| `02-imageproc.js` | pixel maths: adjust, curves, blur, and the Effects list (`FX.list`) |
| `03-fonts.js` | bundled fonts, user-added fonts, reading names and line measures out of font files |
| `04-doc.js` | document, layers (`image`, `text`), text layout and drawing, undo/redo (`History`) |
| `05-view.js` | on-screen canvas, selection handles, touch / mouse gestures |
| `06-ui.js` | home screen, top bar, toolbar, Tools grid, sheets, dialogs, sliders, colour picker, tool "modes", opening files |
| `07-tools-geom.js` | Crop, Flip/Rotate, Resize |
| `08-tools-color.js` | Adjust, Curves, Effects |
| `09-objects.js` | Text, Sticker, Add Photo, options of the selected object, Layers list |
| `10-draw.js` | Draw |
| `11-export.js` | Save / share the finished picture |
| `12-zip.js` | read and write ZIP files (own unpacker for browsers without `DecompressionStream`) |
| `13-plp.js` | open PixelLab `.plp` projects |
| `14-project.js` | pack / read our own project file (`.rongtuli`) |
| `15-store.js` | projects and folders kept on the phone (IndexedDB; memory only where that is not allowed) |
| `16-folders.js` | saving by itself, the safety copy of unsaved work, the Save-project sheet, the My folders page |
| `17-shapes.js` | the 24 shape outlines (`Shapes`) and the Shape tool |
| `18-bench.js` | tools for one picture layer: Crop photo, Shape Crop, and Cutout (= Remove BG, Cutout, Free Crop, Eraser) |
| `18b-aicut.js` | `AICut`: the page side of AI background removal (the worker is `src/ai/rtai.js`) |
| `19-decor.js` | Fit, Border, Frame, Shape Mask, Mask, Lens Flare, Callout |
| `19b-brushfx.js` | Brushes (stamp brushes), Retouch (rub-on fixes), Clone |
| `19c-toolsfx.js` | Enhance, Tilt Shift, Perspective, Motion, Selection, Stretch, Dispersion, Replay |
| `20-main.js` | start-up |

## Tools
| File | Use |
|---|---|
| `tools/run_tests.sh`, `tools/tests/` | browser tests (Playwright, phone-sized Chromium with touch) |
| `tools/pw_common.py` | the test helper (`Session`) |
| `tools/sheet.py` | join screenshots into one picture |
| `tools/fetch_fonts.py` | download the bundled fonts again |
| `tools/make_icons.py` | draw the app icons |
| `tools/fetch_ai.py` | download the AI engine and models into `app/ai/` |
| `tools/setup_android_sdk.sh`, `tools/build_apk.sh` | get the Android build tools; build and sign the APK |
| `tools/make_android_icons.py` | draw the launcher icons into `android/res/` |
| `tools/samples/` | four PixelLab projects used by `tests/test_plp.py` |
| `tools/fetch_samples.py` | download all 18 PixelLab sample projects to `/tmp/plp/all` |
| `tools/plp_compare.py` | open PLP files in the app and put our picture next to PixelLab's own preview |
| `tools/plp_calib.py` | measure how far every text (or picture) sits from where PixelLab drew it |

## Where every button leads
Bottom toolbar (`UI.mainItems()` in `06-ui.js`), left to right:

| Button | Code | What it does |
|---|---|---|
| Tools | `UI.toolsList()` | opens the grid below |
| Effects | `EffectsTool` | 52 effects in categories, with strength |
| Retouch | `RetouchTool` | rub on a part: Smooth, Blemish, Details, Brighten, Darken, Whiten, Colour, Red eye |
| Remove BG / Cutout | `Cutout`, `AICut` | Auto (AI: Person / Object where the add-on is there; else edge colour), Tap colour, Erase, Restore, Draw around, Invert |
| Sticker | `StickerTool` | drawn stickers, emoji, or a picture from the gallery |
| Text | `TextTool` | text with fonts, colour, gradient, stroke, shadow, highlight, bend, bubble |
| Add Photo | `PhotoTool` | a photo as a new layer; its options hold Crop, Shape Crop, Remove BG, Cutout, Eraser, Tools |
| Replay | `ReplayTool` | 10 ready-made looks, applied step by step |
| Fit | `FitTool` | canvas of another ratio with a blurred / coloured / see-through background |
| Brushes | `BrushesTool` | 9 stamp brushes (confetti, flowers, snow, rainbow, …) on their own layer |
| Border | `BorderTool` | a border around or inside the picture |
| Shape | `ShapeTool` | adds one of 24 shapes as a layer |
| Mask | `MaskTool` | 15 light overlays (leaks, bokeh, dust, snow, …) as a locked top layer |
| Draw | `DrawTool` | Pen, Marker, Neon, Spray and an eraser |
| Lens Flare | `FlareTool` | 6 flares, placed like a sticker |
| Shape Mask | `ShapeMaskTool` | a coloured sheet with a shape-formed window |
| Frame | `FrameTool` | 12 drawn frames |
| Callout | `CalloutTool` | speech bubbles (a text layer with `bubble`) |
| Apps | `appsMenu()` | shortcuts |
| My folders | `Folders` | saved projects |

Tools grid: Crop, Free Crop (`Cutout`, draw around), Shape Crop, Dispersion, Clone, Stretch,
Motion, Selection, Curves, Adjust, Enhance, Tilt Shift, Perspective, Resize, Flip/Rotate.
A tool of the grid works on the selected photo layer, otherwise on the background photo
(`Doc.targetImage()`).

## Status
* Stage 1 (done): editor shell, layers, undo/redo, save, Crop, Flip/Rotate, Resize, Adjust,
  Curves, Effects, Text, Sticker, Add Photo, Draw, Apps (shortcut menu).
* Stage 2 (done): open PixelLab `.plp` projects; own projects (save, saved by itself after
  that, re-open, download and share as a `.rongtuli` file); My folders (folders, rename, move,
  copy, delete); a safety copy of unsaved work.
* Stage 3 (done, version 0.3): every toolbar and Tools-grid item works; nothing is marked
  SOON any more. Crop, Shape Crop and background removal for added photos.
* Stage 4 (done, version 0.4): Remove BG with AI on the device (see `docs/ai-remove-bg.md`); the Android app
  (see `docs/android.md`).
* Stage 5 (version 0.5): the 'Remove' button in the PicsArt order (Text, Add Photo, Remove, Replay, Fit);
  86 effects in 6 groups (34 new); online picture search inside Sticker (Openverse, free pictures,
  one fetch per word); a save cache (the finished picture is rendered once and reused, and is prepared in
  the background after an edit, so Save is instant); the screen is drawn at no more than 2× the screen
  density; `targetSdk 35`, still `minSdk 24` (Android 7 and newer).
* Stage 6 (version 0.6): the **Remove** tool — take a thing OUT of a picture and fill its place with what is
  around it (PicsArt's Remove, from the user's video; not the same as Remove BG). Brush / Tap / Erase, Undo
  inside the tool, one undo step in the document; the marked part shows red. The picture stays a whole picture.
  The toolbar now holds both: `removebg` "Remove BG" (Cutout) and `remove` "Remove" (RemoveTool, 18c-remove.js).
* Stage 7 (version 0.7): the rest of the video's features — Shape Mask "Tap to hide background" (a shape window,
  or the tapped colours kept and the rest covered); a Style panel for text and pictures (Fill, Font, Opacity, Blend);
  9 ready-made text Style presets; a Heart bubble; Outline for an added picture; Fit can take the background
  colour from a tap; an "Add" sheet (Shape, Text, Sticker, Add Photo, Draw, Background, Fit).
* Stage 8 (version 0.8): fixes from the user's phone screenshots — the Add sheet's cells (they were blank) and
  **Shape now CUTS the picture** instead of adding a coloured layer (the coloured shapes moved to the Add sheet
  as "Shape"); Remove fills with the picture's own **texture** taken from around the removed part (a switch:
  Keep the texture / Smooth fill).
* Stage 9 (version 0.9): the shapes are **grouped** (Basic / Many sides / Hearts & more / Lines & signs) in the
  Shape picker, Shape Crop and the colour shapes — like the video; three new outlines (Rectangle, Oval, Strip).
  Remove now fills with **PatchMatch patches** copied from the picture around the removed part (a big part is
  worked out on a smaller copy first, so it stays quick), with the smooth way and the grain pass after it.
* Stage 10 (version 0.9): the **update alert** (see `docs/update.md`, and the step-by-step Bengali guide
  `docs/update-bn.md`): the app reads one small `latest.json` at start
  (once a day), and when it says a newer version a sheet offers Update → a small page `app/update.html` → the owner's
  link (Telegram). The Android half checks too (`UPDATE_URL` in MainActivity) and tells the page. No server needed;
  both addresses are empty (`OWNER/GISTID`) until the owner fills them in, so nothing happens before that.
* Stage 11 (version 0.10): the Shape screen like the video — Shape is a crop only (the coloured-shape tool is gone):
  pick a group, tap a shape, and the shape sits on the photo with a frame; ‹ › walk through all the shapes, Undo/Redo
  in the middle of the top bar take a change of shape or frame back, ✓ cuts the photo to it. Text: a big Size slider
  with A− / A+ (0.9 had only the pinch), Slant (sideways lean) and Arc (how tight the circle of a bent line is) — all
  with a %/number shown, and **Nudge** — ← → move the words left/right by a % of the picture's width
  (the frame follows, "Middle" puts them back). The fonts inside a .plp now stay in Text → Font after the file is opened (kept on the phone,
  also after the app is closed) and a font added once is remembered too.
* Remove, honestly: the first thing tried is the picture's own repeating pattern (bricks, tiles, wood, cloth, grass,
  a tiled floor) — the pattern is measured in both directions and the hole is filled with the very same picture one
  period away, so lines go straight through it. When the picture does not repeat, the smooth fill + grain is used.
  With the AI add-on a chip **Person** picks the person in the picture (PicsArt's "Person"); the rest of the picture
  then stays untouched and nothing is copied from the other people in it. Big marks on busy backgrounds are still
  not PicsArt level.
* Stage 12 (version 1.0): the **update news comes from the owner's Telegram channel** — every release is one post
  (`RongTuli 1.1` / a line about it / the download link), and the app reads the channel's public page itself
  (in the Android app the Java half fetches it, so no permission and no CORS trouble). A newer version shows a
  strip on the **home page** ("New version 1.1 … [Update]") and the sheet, and Update leads to the download.
  `latest.json` (jsDelivr + raw) stays as a second source; `tools/publish.py` uploads an APK and writes it.
  Step-by-step Bengali guide: `docs/publish-bn.md`.
* Other AI features (by choice): none.
* The web app is only tested in phone-sized headless Chromium. **The APK has never been run on a phone or emulator.**

## Rules the code relies on
* A layer's bitmap canvas is never drawn into after it is created; an edit always makes a
  new canvas. Undo keeps old canvases, and project saving remembers the packed bytes of
  every canvas, so both depend on this.
* The build output folder must stay named `app`.
* No JS source may contain the text `</script` (the build refuses it).
* A pixel edit of a shape layer must `delete l.shape` (it is a plain picture from then on).
* `build.py` never deletes the big files in `app/ai/`; `tools/build_apk.sh` packs whatever is in `app/`.
* The page must not rely on a service worker, downloads or `navigator.share` inside the Android app: it asks `Native.on`.
