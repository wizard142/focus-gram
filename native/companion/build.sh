#!/usr/bin/env bash
set -euo pipefail
native_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
android_root="${FOCUS_GRAM_ANDROID_ROOT:-$(dirname -- "$(dirname -- "$native_root")")/android-instagram}"
sdk="$android_root/sdk"
source_root="$native_root/companion"
build="$source_root/build"
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
mkdir -p "$build/classes" "$build/dex"
"$tools/aapt2" compile --dir "$source_root/res" -o "$build/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest "$source_root/AndroidManifest.xml" \
  --java "$build/generated" -o "$build/unsigned.apk" "$build/resources.zip"
find "$source_root/src" "$build/generated" -name '*.java' -print > "$build/sources.txt"
javac --release 8 -classpath "$platform" -d "$build/classes" @"$build/sources.txt"
find "$build/classes" -name '*.class' -print > "$build/classes.txt"
"$tools/d8" --lib "$platform" --min-api 28 --output "$build/dex" @"$build/classes.txt"
python3 - "$build" <<'PY'
from pathlib import Path
import sys, zipfile
build = Path(sys.argv[1])
with zipfile.ZipFile(build / 'unsigned.apk', 'a') as apk:
    apk.write(build / 'dex/classes.dex', 'classes.dex')
PY
"$tools/zipalign" -f -p 4 "$build/unsigned.apk" "$build/aligned.apk"
key="$android_root/state/focus-guard.keystore"
if [[ ! -f "$key" ]]; then
  keytool -genkeypair -keystore "$key" -storepass android -keypass android -alias focusgram \
    -dname 'CN=Focus Gram Local' -keyalg RSA -validity 10000 >/dev/null 2>&1
  chmod 600 "$key"
fi
"$tools/apksigner" sign --ks "$key" --ks-pass pass:android --key-pass pass:android \
  --out "$build/focus-guard.apk" "$build/aligned.apk"
"$tools/apksigner" verify "$build/focus-guard.apk"
