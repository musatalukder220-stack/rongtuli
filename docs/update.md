# Update alerts for RongTuli (no server of ours)

Goal: when you bring out a new version, everyone who already has the app is told inside the app —
"Update" — and one tap takes them to your link (a Telegram channel in your plan) where the new APK is.
Nothing is installed behind their back: the phone shows its own install screen.

> **বাংলায় ধাপে ধাপে গাইড:** [`docs/update-bn.md`](update-bn.md) — the whole procedure in simple Bengali.

There is **no server and no admin app** needed. The app asks **one small text file** what the newest
version is. You change that file when you bring out a version.

---

## 1. Where the answer lives: `latest.json`

```json
{
  "version": "1.0",
  "link": "https://t.me/your_channel",
  "note": "Faster Remove, new frames, 3 bugs fixed.",
  "force": false
}
```

| field | meaning |
|---|---|
| `version` | the newest version, e.g. `"1.0"`. Only "newer than the app" matters (`0.10` is newer than `0.9`). |
| `link` | where the new APK is: the Telegram channel/post, a web page, Google Drive, a file host. `https://` only. |
| `note` | two or three words/lines shown in the sheet (optional). |
| `force` | `true` = show the sheet at every start until they update (default `false`: they can press "Later"). |

The app reads it **at start, at most once a day**, and only when the answer is newer than itself.

## 2. Where to keep it (all free, pick one)

| place | how | notes |
|---|---|---|
| **GitHub Gist** (recommended) | make a gist with one file `latest.json`, then use its **raw** address | free, fast, "Raw" address always shows the newest text; the address never changes if you only edit the file |
| any web host / your own domain | upload `latest.json` | needs an `https://` address |
| a Telegram channel post | the post's text is the JSON, its "copy link" is not raw text, so a small page on a host is easier | the **link** for the APK can still be Telegram |
| Notion / a Google Drive file made public | possible, but `latest.json` on a Gist is simpler | Drive links often do not show the text as JSON |

Free hosts for the APK itself: the Telegram channel (a post with the file), Google Drive, MediaFire,
or a Gist is *not* good for a 34 MB APK — use Telegram/Drive/the Play Store link later.

> The address of `latest.json` must stay the same. Editing a Gist file keeps its raw address.

## 3. Set it in the app (two places, one line each)

1. **The page (works everywhere: web, APK):** `src/js/21-update.js`
   ```js
   Updater.INFO_URL = 'https://gist.githubusercontent.com/you/abc123/raw/latest.json';
   Updater.CHANNEL  = 'https://t.me/your_channel';     // used when latest.json has no link
   ```
2. **The Android half (checks even before the page is ready):** `android/java/com/rongtuli/photoeditor/MainActivity.java`
   ```java
   static final String UPDATE_URL = "https://gist.githubusercontent.com/you/abc123/raw/latest.json";
   ```
   (The app lets the network reach exactly this host, plus the Openverse sticker search. Every other
   address stays refused.)

Then `bash tools/build_apk.sh`. The checker in both halves stays quiet while the address still says
`OWNER/GISTID`, so nothing happens until you fill it in.

## 3b. Or let one command do all of it

```bash
python3 tools/release.py --version 1.1 --note "Faster Remove"
```
Needs two environment variables (never kept in the code):
`RT_GH_TOKEN` (GitHub token, this repo only, Contents: read/write) and `RT_GH_REPO=owner/repo`
(optionally `RT_GH_GIST=<gist id>` if `latest.json` lives in a gist instead of the repo).
Without a token the script still bumps the version, builds the page and the APK, and prints the two
things to put up by hand.

## 4. Bringing out a new version

1. Change the version in `src/js/00-util.js` (`APP_VERSION = '1.0'`) — the APK's own version number comes
   from this file, so `versionCode` goes 0.9 → 1.0 = 900 → 10000, which Android accepts as an update.
2. `bash build.py` and `bash tools/build_apk.sh` → `android/RongTuli-1.0.apk`.
3. Put that APK where your link points (a Telegram channel post is fine).
4. Edit `latest.json`: `"version": "1.0"`, the same `link`, a short `note`.
5. Done. The next time someone opens the app (or the day after), they see **"A new version is ready"**.

**Sign with the same key every time** (`android/keys/rongtuli.keystore`). A different key cannot be
installed over the old app — the phone refuses it. Keep that file and its password safe.

## 5. What the user sees

* A sheet: *A new version is ready — You have 0.9 · new is 1.0 — note* with buttons **Update** and **Later**.
* **Update** opens the small page `update.html` inside the app (version + note + the three install steps) and
  its button opens your link in the phone's browser/Telegram. Back returns to the app.
* **Later** keeps quiet for that version; the sheet comes back only when a newer version appears
  (or at every start when `"force": true`).
* An update installs **over** the app; pictures, projects and folders stay (they live in the app's own storage).

## 6. Limits (honest)

* This is a **notice**, not a silent self-update. Android does not let an app install another app by itself
  without the user tapping through the install screen — that is a security rule, not a missing feature.
  (A silent update needs the Google Play Store, or a rooted phone.)
* If the phone is offline, or the file cannot be read, **nothing is shown** and the app works as usual.
* The app tells nobody anything: it only *downloads* the small text file. No usage data is sent.
* The check happens once a day at most, so a fresh release may be a few hours old before everyone sees it.
  With `"force": true` it is shown at every start until they update.
* The user can always check by hand: **More → Check for updates** in the editor.

## 7. If you later want the Play Store

Then this whole thing is not needed: Play updates the app itself. The same build can go to Play, but it
needs an `.aab` bundle, a developer account, a privacy policy and the final app id — decide that **before**
the first upload (see docs/android.md).
