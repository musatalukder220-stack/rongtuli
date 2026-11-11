# RongTuli as an Android app

`android/RongTuli-<version>.apk` is the web app (`app/`) inside a small Android wrapper. It needs no internet,
except for the online picture search inside Sticker (Openverse). That is the only address the wrapper lets out:
`api.openverse.org` and picture files (addresses ending in .jpg/.png/… on any host, plus flickr and wikimedia picture hosts).
Everything else is still refused, so no stray request of the page can reach the network.

**Status: built and signature-checked here, but never started on a phone or an emulator** (this machine has neither).
The page's half was tested in Chromium with a stand-in for the Android side (`tools/tests/test_android_bridge.py`).

## Install on a phone
1. Copy `RongTuli-<version>.apk` to the phone and tap it.
2. Android asks to allow installing from this source ("Install unknown apps") – allow it once.
3. Play Protect may say the developer is unknown – choose "Install anyway".

Needs Android 7.0 or newer and an up-to-date "Android System WebView" (Play Store updates it by itself).
A later version installs over the old one only if it is signed with the same key (see below).

## What the wrapper does (`android/java/.../MainActivity.java`)
| Need | How |
|---|---|
| Show the app | a web view loads `https://appassets.androidplatform.net/index.html`; every request to that address is answered from `assets/www` inside the APK, every other address is refused. A real https address is used so that IndexedDB (projects) and the AI helper work. |
| "Open photo / font / project" | the page's file buttons open the phone's file picker (`onShowFileChooser`) |
| Save | the page hands the file over in base64 pieces (`RTAndroid.begin / chunk / save`, page side: `Native` in `00-util.js`). Pictures go to `Pictures/RongTuli`, other files (`.rongtuli`) to `Download/RongTuli`. Android 9 and older ask for the storage permission once. |
| Share | `RTAndroid.share` → the phone's Share sheet; the file is lent out through `ShareProvider` |
| Back button | goes back in the page's history, which closes the top-most sheet / tool / the editor; on the first screen it leaves the app |
| Low memory | if Android closes the web view's process, a new one is started (the page offers the safety copy of unsaved work) |

Not there yet: "Open with RongTuli" from a file manager, and sharing a picture *into* the app.

## Build
```bash
bash tools/setup_android_sdk.sh     # once per machine: build-tools 35.0.0 + platform android-35 into /opt/android-sdk
python3 tools/fetch_ai.py           # once: the AI files into app/ai (leave out for a 2 MB app without AI)
bash tools/build_apk.sh             # -> android/RongTuli-<version>.apk
```
No Gradle: `aapt2` (resources), `javac`, `d8`, `zipalign`, `apksigner`. Needs a JDK 11+, `zip`, `python3`.
The version name is `APP_VERSION` from `src/js/00-util.js`; the version code is made from it (0.4 → 400).
The app id is `com.rongtuli.photoeditor` (in `android/AndroidManifest.xml`, the Java package and `tools/build_apk.sh`).

## The signing key
`android/keys/rongtuli.keystore` (password in `android/keys/password.txt`) was made on the first build.
**Keep both files and keep them private.** Without them no update can replace an installed app, and anyone who has
them can sign an app that passes as yours.

## Play Store (not done)
* A Google Play developer account (one-time fee) and a privacy policy page.
* Google wants an `.aab` bundle, not an APK, and a recent target API level (this build targets 35, Android 15).
  The page leaves room for the system bars by itself (`env(safe-area-inset-*)`, `viewport-fit=cover`;
  `res/values-v35/styles.xml` makes the window draw edge to edge). A bundle needs a Gradle project or `bundletool`.
* Choose the final app id before the first upload; it cannot be changed afterwards.

## The other way: no APK at all
Put the folder `app/` on any https web space. Chrome on Android then offers "Add to Home screen"; the app opens
full-screen and works offline (service worker), with Chrome's own file picker, downloads and sharing.
