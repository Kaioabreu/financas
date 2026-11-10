#!/usr/bin/env bash
# Build local do APK de release para o celular (Windows + Git Bash). Ver docs/build-local.md.
#   scripts/build-local.sh            só JavaScript mudou: sincroniza, compila, instala (rápido)
#   scripts/build-local.sh --native   dependência nativa ou app.config.ts mudou: roda o prebuild antes
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
DST="C:/f"   # caminho curto e sem acento: o CMake/Ninja estoura 260 caracteres em caminhos longos
export JAVA_HOME="C:\Program Files\Java\jdk-21.0.10"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export CI=1
ADB="$ANDROID_HOME/platform-tools/adb.exe"

# copia só o que mudou (sem .git, scratch, protótipos nem a pasta android gerada)
robocopy "$SRC" "$DST" //E //XD "$SRC/.git" "$SRC/prototypes" "$SRC/android" "$SRC/scratch" //NFL //NDL //NJH //NJS //NP >/dev/null || [ $? -lt 8 ]

cd "$DST"
if [ "${1:-}" = "--native" ] || [ ! -d android ]; then
  npx expo prebuild --platform android
fi
cd android
echo "sdk.dir=$(cygpath -m "$ANDROID_HOME")" > local.properties
./gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=false -Pandroid.enablePngCrunchInReleaseBuilds=false
"$ADB" install -r app/build/outputs/apk/release/app-release.apk
