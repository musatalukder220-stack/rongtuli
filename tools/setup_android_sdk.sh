#!/bin/bash
# Fetch the two Android SDK parts that tools/build_apk.sh needs (about 120 MB download, 280 MB unpacked).
#   bash tools/setup_android_sdk.sh            -> /opt/android-sdk   (or $ANDROID_SDK)
# Also needed: a JDK (11 or newer) with java, javac and keytool; zip; python3.
set -e
SDK="${ANDROID_SDK:-/opt/android-sdk}"
if [ ! -d "$SDK" ]; then mkdir -p "$SDK" 2>/dev/null || { sudo mkdir -p "$SDK" && sudo chown "$(id -u):$(id -g)" "$SDK"; }; fi
cd "$SDK"
if [ ! -x build-tools/35.0.0/aapt2 ]; then
  echo "fetching build-tools 35.0.0 …"
  curl -fsSL -o bt.zip https://dl.google.com/android/repository/build-tools_r35_linux.zip
  mkdir -p build-tools && unzip -q -o bt.zip -d build-tools && rm -f bt.zip
  rm -rf build-tools/35.0.0 && mv build-tools/android-15 build-tools/35.0.0
fi
if [ ! -f platforms/android-35/android.jar ]; then
  echo "fetching platform android-35 …"
  curl -fsSL -o pf.zip https://dl.google.com/android/repository/platform-35_r02.zip
  mkdir -p platforms && unzip -q -o pf.zip -d platforms && rm -f pf.zip
fi
build-tools/35.0.0/aapt2 version
echo "Android SDK parts are ready in $SDK"
