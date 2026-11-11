# RongTuli projects – the `.rongtuli` file and how projects are kept

Code: `src/js/14-project.js` (the file), `15-store.js` (keeping it on the phone),
`16-folders.js` (when it is saved, My folders). Tests: `tools/tests/test_project.py`,
`test_project_flows.py`, the last part of `test_plp.py`.

## The file
A `.rongtuli` file is a ZIP archive whose entries are **stored, not compressed** (the pictures
inside are already JPEG / PNG, so compressing again only costs time). Any unzip tool opens it.

| Entry | Contents |
|---|---|
| `project.json` | the document (below). Always the first entry. |
| `layers/N.jpg`, `layers/N.png` | one file per *distinct* picture. Two layers that show the same picture (a duplicate) point to the same file. |
| `fonts/N` | font files (TTF / OTF / WOFF) of the fonts the texts use and that are not built into the app: fonts the user added and fonts that came inside a PixelLab project. |
| `thumb.jpg` | a small preview (longest side 360) for My folders. |

Pictures: a photo without see-through parts is kept as JPEG (quality 0.94); a picture with
see-through parts, or a flat drawing, as PNG (lossless).

### `project.json`
```json
{
  "app": "RongTuli", "format": 1, "version": "0.2",
  "name": "Eid poster", "saved": "2026-11-11T07:14:00.000Z",
  "width": 1080, "height": 1350,
  "bg": { "type": "color", "color": "#ffffff" },
  "layers": [ … bottom first … ],
  "fonts": [ { "family": "Li Alinur Tatsama", "file": "fonts/0" } ]
}
```
* `bg.type`: `color` (`color`), `gradient` (`grad`), or `none` (see-through).
* A layer is the layer object of `04-doc.js` written out as it is, minus what cannot be
  written (the canvas, caches):
  * every layer: `type` (`image` | `text`), `name`, `x`, `y` (centre, in document px), `scaleX`,
    `scaleY`, `rotation` (radians), `opacity`, `blend`, `visible`, `locked`, `flipH`, `flipV`;
  * image layers: `src` (the entry name), `w`, `h` (px of that picture);
  * text layers: `text`, `font`, `size`, `color`, `align`, `bold`, `italic`, `lineHeight`,
    `spacing`, `bend`, `stroke`, `shadow`, `bg` (highlight), `grad` (gradient fill), `spans`
    (parts with their own colour / font), `wrap`.
* `format` is raised when a newer app writes something an older one would misread. A file with
  a higher `format` than the app knows is still opened as well as possible, with the note "made with a newer version; some things may look different".

### Reading is defensive
`Project.read` treats the file as untrusted (it may come from anybody):
* sides are limited to 8192 px, pictures are shrunk to at most 4096 px;
* numbers are checked, unknown layer types are skipped, a missing picture skips that layer and
  adds a note instead of failing the whole file;
* text settings are copied onto a fresh default text layer, so a file from an older version
  that lacks newer settings still opens;
* font family names are taken from the file only as labels: if the name is already used by
  another font, the font from the file gets a new name and the texts are pointed to it.

## Keeping projects on the phone
IndexedDB database `rongtuli`, version 1, two object stores:

| Store | Key | Records |
|---|---|---|
| `meta` | `id` | `{ kind: 'project', id, name, folder, created, modified, width, height, count, size, thumb }`, `{ kind: 'folder', id, name, created }`, and at most one `{ kind: 'draft', id: 'draft', … }` |
| `data` | the same id | the bytes of the `.rongtuli` file |

The list in My folders reads only `meta` (small), so it stays fast with many projects.
`meta` and `data` of a project are written in one transaction: a full phone leaves the old
version untouched.

Where the browser gives no storage (the sandboxed preview window, some private modes), the
same interface keeps everything in memory, `Store.persistent` is `false`, and the app says so
in the Save dialog, in the menu and on the My folders page.

## When things are saved (`16-folders.js`)
* **Saved project** (`Doc.pid` set): every committed change is written 3.5 s after the last
  one. Nothing is written while a tool is open (its changes are not committed yet). When the
  page goes to the background the pending save is done at once.
* **Unsaved work** (a photo being edited, an imported PLP after the first change): the same
  timer writes a **safety copy** (the `draft` record). The home screen then offers
  "Unfinished edit → Continue". There is room for one safety copy; if another unsaved edit
  needs the place, the older copy is moved into My folders as "Unsaved edit <date>" instead
  of being lost.
* **Closing**: a saved project is saved without a question. Unsaved work asks
  Keep editing / Don't save / Save project. If a save fails (phone full), the user is told
  and asked before anything is thrown away.
* Packing is cheap after the first time: the packed bytes of every picture are remembered per
  canvas (canvases are never changed after they are made), so a re-save only packs what is new.
  Measured on the 18 PixelLab samples: first save 0.1–0.6 s, re-save 0.02–0.12 s, open 0.8–1.6 s;
  files 0.7–10 MB.
