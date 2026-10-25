#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="PostAnkiIOS.xcodeproj"
VARIANT="${VARIANT:-prod}"
LOCAL_API_PORT="${LOCAL_API_PORT:-5560}"
EXTRA_SETTINGS=("CURRENT_PROJECT_VERSION=$(date +%y%m%d.%H%M)")

if [[ "$VARIANT" == "dev" ]]; then
  SCHEME="PostAnkiIOSDev"
  BUNDLE_ID="com.ikushlianski.postankiios.dev"
  CONFIGURATION="${CONFIGURATION:-Debug}"
  LAN_IP="$(ipconfig getifaddr en0 || true)"

  if [[ -n "$LAN_IP" ]]; then
    EXTRA_SETTINGS+=("POSTANKI_DEV_API_URL=http://${LAN_IP}:${LOCAL_API_PORT}")
  fi
else
  SCHEME="PostAnkiIOS"
  BUNDLE_ID="com.ikushlianski.postankiios"
  CONFIGURATION="${CONFIGURATION:-Release}"
fi

APP="build/Build/Products/${CONFIGURATION}-iphoneos/${SCHEME}.app"
DEVICE="${1:-}"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen not found; install it with: brew install xcodegen" >&2
  exit 1
fi

if ! grep -Eq '^DEVELOPMENT_TEAM *= *[A-Z0-9]+' Local.xcconfig 2>/dev/null; then
  echo "Set DEVELOPMENT_TEAM (your Apple ID team id) in apps/ios/Local.xcconfig first." >&2
  exit 1
fi

if [[ -z "$DEVICE" ]]; then
  LIST="$(mktemp)"
  xcrun devicectl list devices --json-output "$LIST" >/dev/null
  DEVICE="$(python3 -I - "$LIST" <<'PY'
import json, sys
devices = json.load(open(sys.argv[1]))["result"]["devices"]
for d in devices:
    props = d.get("hardwareProperties", {})
    state = d.get("connectionProperties", {}).get("tunnelState")
    if props.get("platform") == "iOS" and state in ("connected", "connecting"):
        print(props["udid"])
        break
PY
)"
  rm -f "$LIST"
fi

if [[ -z "$DEVICE" ]]; then
  echo "No iPhone found. Plug it in once (or pair over Wi-Fi), unlock it, and tap Trust." >&2
  exit 1
fi

xcodegen generate

xcodebuild build -project "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIGURATION" \
  -destination "id=$DEVICE" -derivedDataPath build -allowProvisioningUpdates ${EXTRA_SETTINGS[@]+"${EXTRA_SETTINGS[@]}"}

xcrun devicectl device install app --device "$DEVICE" "$APP"
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID"

echo "Installed. The free-account install expires in 7 days; rerun this script before then."
