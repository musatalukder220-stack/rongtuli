#!/bin/bash
# Build the Android app (APK) from app/ and android/.      Usage:  bash tools/build_apk.sh
#
#   1. python3 build.py                       -> app/            (the web app; app/ai/ holds the AI add-on)
#   2. aapt2 / javac / d8 / zipalign / apksigner (no Gradle)     -> android/RongTuli-<version>.apk
#
# Needs: tools/setup_android_sdk.sh run once on this machine, a JDK (11+), zip, python3.
# The signing key is android/keys/rongtuli.keystore (made on the first run). KEEP THAT FILE AND ITS PASSWORD:
# a phone only accepts an update of the app when it is signed with the same key.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP_ID="com.rongtuli.photoeditor"
SDK="${ANDROID_SDK:-/opt/android-sdk}"
BT="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
WORK="${APK_WORK:-$HOME/.cache/rongtuli-apk}"            # on disk and outside the saved workspace
JBIN="$(dirname "$(readlink -f "$(command -v java)")")"
KEYTOOL="$(command -v keytool || echo "$JBIN/keytool")"
[ -x "$BT/aapt2" ] && [ -f "$PLATFORM" ] || { echo "Android SDK parts are missing: run  bash tools/setup_android_sdk.sh"; exit 1; }

python3 build.py
NAME="$(grep -o "APP_VERSION = '[^']*'" src/js/00-util.js | cut -d"'" -f2)"
CODE="$(python3 -c "
import sys
p = [int(x) for x in ('$NAME' + '.0.0').split('.')[:3]]
print(p[0] * 10000 + p[1] * 100 + p[2])")"
OUT="$ROOT/android/RongTuli-$NAME.apk"
echo "version $NAME (code $CODE)"

# ---- signing key (once) ----
KS="$ROOT/android/keys/rongtuli.keystore"; PW="$ROOT/android/keys/password.txt"
if [ ! -f "$KS" ]; then
  mkdir -p "$ROOT/android/keys"
  python3 -c "import secrets; print(secrets.token_urlsafe(18))" > "$PW"
  "$KEYTOOL" -genkeypair -keystore "$KS" -storetype PKCS12 -alias rongtuli -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass "$(cat "$PW")" -keypass "$(cat "$PW")" -dname "CN=RongTuli, O=RongTuli, C=BD" >/dev/null 2>&1
  echo "made a new signing key: android/keys/rongtuli.keystore (password in android/keys/password.txt) - keep both"
fi

# ---- the web app goes into assets/www ----
rm -rf "$WORK"; mkdir -p "$WORK/assets/www" "$WORK/gen" "$WORK/classes" "$WORK/dex"
cp -r app/. "$WORK/assets/www/"
rm -f "$WORK/assets/www/sw.js"                           # the app needs no service worker: its files are inside the APK
[ -f "$WORK/assets/www/ai/manifest.json" ] && grep -q '"ready": true' "$WORK/assets/www/ai/manifest.json" && AI="with the AI add-on" || AI="WITHOUT the AI add-on (run python3 tools/fetch_ai.py first)"
echo "packing $(du -sh "$WORK/assets/www" | cut -f1) of web files, $AI"

# ---- resources, code, package ----
"$BT/aapt2" compile --dir android/res -o "$WORK/res.zip"
"$BT/aapt2" link -o "$WORK/base.apk" -I "$PLATFORM" --manifest android/AndroidManifest.xml -A "$WORK/assets" --java "$WORK/gen" \
  --min-sdk-version 24 --target-sdk-version 35 --version-code "$CODE" --version-name "$NAME" -0 .onnx "$WORK/res.zip"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$PLATFORM" -d "$WORK/classes" $(find android/java "$WORK/gen" -name '*.java')
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 --lib "$PLATFORM" --output "$WORK/dex" $(find "$WORK/classes" -name '*.class')
(cd "$WORK/dex" && zip -q -j ../base.apk classes.dex)
"$BT/zipalign" -f -p 4 "$WORK/base.apk" "$WORK/aligned.apk"
java -jar "$BT/lib/apksigner.jar" sign --ks "$KS" --ks-pass "file:$PW" --ks-key-alias rongtuli --out "$OUT" "$WORK/aligned.apk"
rm -f "$OUT.idsig"

# ---- checks ----
java -jar "$BT/lib/apksigner.jar" verify --min-sdk-version 24 "$OUT" && echo "signature: ok"
"$BT/aapt2" dump badging "$OUT" | grep -E "^package|^sdkVersion|^targetSdkVersion|^application-label:|^launchable-activity|uses-permission" | cut -c1-160
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
