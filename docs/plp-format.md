# PixelLab `.plp` project format – what we learned

Worked out from 18 real template files (see `tools/fetch_samples.py`). PixelLab is closed
source, so everything here is observation, not a specification.

* **(measured)** – checked against PixelLab's own picture of the project (the `thumb` entry)
  with `tools/plp_calib.py` / `tools/plp_compare.py`.
* **(guess)** – plausible, but no sample could confirm it.

Code: `src/js/13-plp.js`. Test: `tools/tests/test_plp.py` (four samples in `tools/samples/`).

## Container
* A `.plp` file is a ZIP archive.
* Every entry is stored with method 8 (deflate) and flag bits `0x0808`:
  the sizes in the *local* headers are 0, so sizes and offsets must be read from the
  **central directory** at the end of the file.
* Entries:
  * `data.plab` – UTF-8 JSON, the project.
  * `thumb` – a small JPEG (longest side 256) drawn by PixelLab. Used as ground truth in tests.
  * `/res/XXXX` (4 random characters, **leading slash**, no extension) – pictures (PNG / JPEG)
    and font files (TTF / OTF). The type is found from the first bytes.

## `data.plab` – top level
| Key | Meaning |
|---|---|
| `objectsIds` | list of object ids, **bottom first** (z-order) |
| `objectsBundle` | `{ id: object }`; ids start with `shape` or `text` |
| `bgType` | 1 = colour (`bgColor`), 2 = gradient (`bgGradientV2`), 4 = photo (`bgPhotoSrc`); 3 probably transparent **(guess)** |
| `bgWidth`, `bgHeight`, `bgPhotoForcedDim` | export size in px when `bgPhotoForcedDim` is true. Otherwise the numbers are not reliable (often 1×1) and only the *container* aspect ratio is known; we then make the long side at least 1280 px **(guess)** |
| `bgPhotoSrc.imgSrcPath` | `/storage/…/presets/<name>/res/XXXX` → use the last path part as the `/res/` entry |
| `bgPhotoCrop` | crop of the background photo, see "crop info" |
| `effectHueVal` | colour shift of the **background only**, in degrees, with the matrix of CSS `hue-rotate()` **(measured** on p18: −72 fits, +72 / −36 / −144 do not; the shapes on top are not shifted) |
| `effectBrightnessVal`, `effectContrastVal`, `effectSaturationVal` | more background settings; always 0 in the samples, units unknown. Not imported (a note is shown) |
| `effectVignetteEnabled`, `effectStripesEnabled`, `effectNoiseEnabled` (+ `…Alpha`, `…Val2`, `…Color`) | background effects; never on in the samples. Not imported (a note is shown) |

Colours are Android ARGB integers (signed 32 bit): `-1` = `#FFFFFFFF`, `-16777216` = `#FF000000`.

Gradient strings: `v2;<type>;x0/y0/x1/y1;c1/c2/…;p1/p2/…`
* type 3 = linear from (x0,y0) to (x1,y1), type 4 = radial with centre (x0,y0) and (x1,y1) a point on the rim **(guess for the radius)**
* coordinates are percent of the box, colours ARGB ints, stops 0..1.

Crop info: `cropInfoPorLeft/Top/Right/Bottom` are fractions × 100000 of the source picture,
`cropInfCirc` = circle mask, `cropInfRot` = rotation, `mHbGHc` / `n7gV4v` = flips **(guess)**.

## Coordinates
Every object carries `shapeOldContainerWidth/Height`: the size in screen px of the canvas
on the designer's phone. `shapeX`, `shapeY`, `shapeWidth`, `shapeHeight`, text sizes, paddings,
stroke widths … are all in those **container px**. Multiply by `k = docWidth / containerWidth`.
The container has the same aspect ratio as the picture.

## `shape…` objects (pictures and vector shapes)
* `shapeImageShapeType`: 2 = photo, 3 = PNG / sticker, 4 = hand-drawn shape, 5 = vector shape.
  **All of them have a ready picture in `/res/`** (`shapeImageSrc.imgSrcPath`). For type 5 it is
  the shape already drawn in its colour at 2× size, so no vector drawing is needed.
* `shapeX`, `shapeY` = top-left corner of the unrotated box; `shapeWidth`, `shapeHeight` (strings) = its size.
  **(measured once while tuning, not repeated since:** pictures landed about 1 container px from PixelLab's: mean −0.8 / −0.5 px)
* `shapeRotation` (string, degrees, clockwise, around the centre), `shapeOpacity` 0–100,
  `objectHidden`, `objectLocked`.
* `shapeRotationY` = 180 → mirrored left-right; `shapeRotationX` = 180 → upside-down mirror;
  other angles are a 3-D tilt (imported as a simple squeeze, with a note).
* `shapeImageCropInfo` – crop (and circle mask) applied to the `/res/` picture before it is shown.
* `shapeColorOverlayEnabled` + `shapeColorOverlayColor` – paint every visible pixel in one colour
  (keeps transparency). `sCOfT` = 2 → use gradient `sCOG` instead of the colour.
* `shapeRemoveColorEnabled` + `shapeRemoveColorCT` `[colour, tolerance]` – make that colour transparent.
* `shapeStrokeEnabled`, `shapeStrokeColor`, `shapeStrokeWidth` – outline around the picture.
  The width is the whole line, half of it shows outside (`STROKE_K = 0.5`, **guess**).
* `shapeShadowEnabled`, `shapeShadowColor`, `shapeShadowDx/Dy`, `shapeShadowRadius` – drop shadow
  (our blur = radius × 1.15 + 1, **guess**).
* `shapePerspectiveEnabled` + `shapePerspectiveP1..P4 X/Y` – corners TL, TR, BR, BL in 0..1000 of the box
  (may go outside).
* **Eraser** `shapeBmpErMa`: `{ n: { Ea: [l,t,r,b], Eb, Ef, Ew, PtD: { PtD: […] } } }` – strokes rubbed out of
  the picture. `Ea` = where the picture was on the screen (screen px), `Ew` = line width, `Ef` = fill the
  outline instead of stroking it. `PtD` is a list of commands: `f n` (start), `l flag x y` (line; flag 1 = move),
  `q flag cx cy x y` (curve), `c x y r` (dot). Samples: p05 shape5, p06 shape6. Soft edges are drawn hard.
* **Cut with a curve** `sBmD21` (with `sBmE43`; p11 shape4): closed Bézier curves, 3 points per corner
  (corner, handle, handle); `BcR2` = the picture rectangle on the screen. What is inside is removed.
* `qUDmYrz` (only type 5): the vector description. `mfp2JbFB` = `rect|oval|tri1|tri2|hex|…`,
  `mrdCt2Pon.9vwh` fill colour, `.NyqG` fill type (1 colour, 2 gradient `.A67W`), `.UJ3K` stroke colour,
  `.vtf8` stroke width, `2Xskb7` corner radius. Not needed because of the ready picture.
* Not imported (a note is shown when used): 3-D depth (`shapeThreeDEnabled`), emboss, inner shadow.
  None of the samples uses them.

## `text…` objects
* `textTextString`, `textRotation`, `textOpacity`, `textTextSize` (font size in container px).
* `textTextColor`, `textTextFont`, `textBold`, `textItalic`, `textUnder` – **lists of intervals**
  `{ intervalN: { textsIntervalsStart, textsIntervalsEnd, textsIntervalsColor | textsIntervalsFont } }`
  (UTF-16 indices, end exclusive). So one text can have several colours and fonts. Intervals may
  overlap and may run past the end of the text: clamp them; later intervals win.
* `textAlignment` – Android gravity: 8388659 left, 17 centre, 53 / 8388661 right.
* `textStrokeEnabled/Color/Width`, `textOuterEnabled` + `textOuterColor/Dx/Dy/Radius` (shadow),
  `textBgEnabled` + `textBgColor`, `textBgPaddingLeft/Right/Top/Bottom`, `textBgBorderRadius`,
  `textBgFillType` / `textBgGradientV2` (we show a gradient highlight in one colour),
  `textTextFillType` 2 → gradient `textTextGradientV2`, `textTextCurve` (curved text, shown roughly).
* Not imported (a note is shown when used): 3-D text (`textThreeDEnabled`), emboss, inner shadow,
  reflection, texture fill, perspective (`textPerEn`), glow, gradient stroke. None of the samples uses them.
  `textJustify` and `tLSWrds` are ignored.

### Fonts
* A path ending in `/res/XXXX` is a font file inside the project. It is loaded and listed under the
  name written inside the font.
* `{}` (no interval) = the phone's default font (Roboto on most Android phones). Bold and italic of
  the default font are the real bold / italic faces **(measured:** widths fit Roboto Bold Italic).
  For a font from a file, bold is "fake bold" (thicker outline, same widths); browsers do the same.
* A path like `fonts/Basic/Neuton-Regular.ttf` is a font **built into PixelLab**; it is *not* in the file.
  * The app carries three of them: Neuton, Amaranth, Abril Fatface.
  * PixelLab's copies are older than today's Google Fonts files and have other line measures, so the
    numbers are kept in the `BUILTIN` table of `13-plp.js` **(measured** on p07: with today's Neuton
    numbers the title sat 14 px too low and four lines of text ran 20 px too far down).
  * Other built-in fonts (`MEME font`, `Blogger_Sans`, `Blackout Midnight`, …) are swapped for a similar
    font we have, and the report says so. A font the user added under the same name is used instead,
    which is the way to supply a missing font.
  * Fonts whose folder or name says icon / social / arrow / symbol are **picture fonts** (`Type Icons`,
    `font social media`, `KGArrows` in p03, p08, p17, p18). Their letters would show as plain letters,
    so those layers are imported hidden and the report says so.

### Where the letters go (measured)
`shapeX` / `shapeY` is the top-left corner of PixelLab's text box (an Android text view), *before*
the highlight padding is added around it.
* **Left edge:** letters start at `shapeX + 4 + ZpG28v` px; on the right the box keeps `4 + deNYb4` px
  free. `ZpG28v` / `deNYb4` are extra side paddings (non-zero in p08 text16, p10 text9, p11 text11,
  p18 text6 / text8), not a slant as first thought. The 4 (`TEXT_PAD`) is an average: single files sit
  between about −5 and +5 px of it, cause unknown.
* **First baseline:** `shapeY + max(yMax, ascent) × size`, where `ascent` comes from the font's `hhea`
  table (the OS/2 typo values if the font says USE_TYPO_METRICS) and `yMax` from `head`.
  For the default font: Roboto, ascent 0.928, yMax 1.056.
* **Line pitch:** `(ascent + descent) × size + textLineSpacing` (px, may be negative).
* **Letter spacing:** `textLetterSpacing` is in hundredths of the font size, half of it before and half
  after every letter (so a line also starts half a gap later).
* **Wrapping:** `textMaxWidth` (−1 = none) is the widest the *whole box* may get, so the lines have
  `textMaxWidth − 8 − ZpG28v − deNYb4` px. A word longer than a line is cut between letters (p17: two
  rows of 16 dots become four rows of 8). As soon as one line is broken the box takes the full width,
  and centred / right-aligned lines are placed inside that full width (p16 "LOGO HERE").
  A line up to 0.5 % too long still counts as fitting (`WRAP_SLACK`): letters measure a little
  differently from phone to phone, and of the two close calls in the samples one fits by 0.3 %
  in PixelLab and the other does not by 1 %.
* **Highlight:** the `textBgPadding…` values are added outside the box on each side on their own.

Result of one calibration run while tuning (not repeated after the last small changes), on the 22 texts
that could be measured reliably (own font file, one font, enough contrast):
median error 0 px in both directions, standard deviation 3.7 px across and 2.5 px down
(container px; the pictures are about 700 px wide there).

## How close the import is
`tools/plp_compare.py` puts our picture next to PixelLab's and prints the mean difference per colour
channel after a small blur (0 = the same, 255 = opposite). A different font or a missing icon shows as
2–6; JPEG noise of the small preview alone is roughly 1.5 (an estimate, not measured exactly).

| | | | | | |
|---|---|---|---|---|---|
| p01 4.1 | p02 3.4 | p03 3.2 | p04 2.1 | p05 1.7 | p06 3.4 |
| p07 3.6 | p08 3.6 | p09 2.7 | p10 3.3 | p11 2.7 | p12 3.0 |
| p13 1.9 | p14 3.3 | p15 1.7 | p16 4.8 | p17 4.4 | p18 3.5 |

What the samples exercise: p01 stroke, remove-colour, built-in fonts · p02 gradient background, many
fonts · p03 photo background, perspective, wrapped default font · p04 perspective, uneven highlight
padding · p05 / p06 eraser · p07 turned text at 38 %, built-in fonts · p08 icon fonts, 70 MB of
pictures · p09 / p10 gradient text, 3-D tilt · p11 cut curve, wrap widths, script font · p12 photo
shadow · p13 hidden shape, perspective · p14 remove white × 8 · p15 mirrored photo, pill highlight ·
p16 37 objects · p17 circle crop, text in several colours, negative line spacing · p18 background hue,
icon fonts.

## Known gaps
* Picture fonts built into PixelLab cannot be drawn (layers are hidden).
* Built-in fonts we do not carry are swapped (their width differs a little).
* 3-D depth, emboss, inner shadow, reflection, texture, text perspective, glow: not drawn; no sample to
  learn from yet.
* Soft eraser edges are hard; a gradient highlight is one colour; a 3-D tilt is a squeeze; curved text
  is approximate.
* Background brightness / contrast / saturation, vignette, stripes, noise: not applied.
