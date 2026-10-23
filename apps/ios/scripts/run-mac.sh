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

xcodebuild build -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
  -destination 'platform=macOS' -derivedDataPath build

open "build/Build/Products/Debug/PostAnkiMac.app"
