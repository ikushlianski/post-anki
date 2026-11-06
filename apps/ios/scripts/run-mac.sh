#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="PostAnkiIOS.xcodeproj"
SCHEME="PostAnkiMac"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen not found; install it with: brew install xcodegen" >&2
  exit 1
fi

xcodegen generate

if [[ "${1:-}" == "--test" ]]; then
  xcodebuild test -project "$PROJECT" -scheme "$SCHEME" \
    -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO
  swift test --package-path Packages/PostAnkiAPI
  exit 0
fi

API_SETTINGS=()

if [[ "${LOCAL:-}" == "1" ]]; then
  API_SETTINGS+=("POSTANKI_DEV_API_URL=http://localhost:${LOCAL_API_PORT:-5560}")
fi

xcodebuild build -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
  -destination 'platform=macOS' -derivedDataPath build \
  POSTANKI_BAND_LABEL="${BAND_LABEL:-DEV}" ${API_SETTINGS[@]+"${API_SETTINGS[@]}"}

APP="$PWD/build/Build/Products/Debug/PostAnkiMac.app"

DEV_COPY_PATTERN="/Build/Products/Debug/PostAnkiMac.app/Contents/MacOS/PostAnkiMac"

for PID in $(pgrep -f "$DEV_COPY_PATTERN" || true); do
  kill "$PID" 2>/dev/null || true
done

for _ in $(seq 1 20); do
  pgrep -f "$DEV_COPY_PATTERN" >/dev/null || break
  sleep 0.25
done

open -n "$APP"
