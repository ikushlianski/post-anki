#!/usr/bin/env bash
# Builds the Mac app, launches it and saves a window screenshot.
# Usage: scripts/shot-mac.sh [output.png]   (needs Screen Recording permission for the terminal)
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="${1:-build/mac-shot.png}"
APP="build/Build/Products/Debug/PostAnkiMac.app"

xcodegen generate
xcodebuild build -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -configuration Debug \
  -destination 'platform=macOS' -derivedDataPath build CODE_SIGNING_ALLOWED=NO >/dev/null

pkill -x PostAnkiMac 2>/dev/null || true
sleep 2
open "$APP"
sleep 4

PID=$(pgrep -x PostAnkiMac | head -1)
WID=$(swift - "$PID" <<'SWIFT' 2>/dev/null || true
import CoreGraphics
import Foundation
let pid = Int(CommandLine.arguments.last ?? "") ?? 0
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
for w in list where (w[kCGWindowOwnerPID as String] as? Int) == pid && (w[kCGWindowLayer as String] as? Int) == 0 {
    print(w[kCGWindowNumber as String] as? Int ?? 0)
    break
}
SWIFT
)
mkdir -p "$(dirname "$OUT")"
if [[ -n "$WID" && "$WID" != "0" ]]; then
  screencapture -x -l "$WID" "$OUT"
else
  screencapture -x "$OUT"
fi
echo "$OUT"
