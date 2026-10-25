#!/usr/bin/env bash
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOG="$HOME/Library/Logs/postanki-iphone-install.log"
HERE="$(cd "$(dirname "$0")" && pwd)"

{
  echo "=== $(date) ==="
  "$HERE/install-iphone.sh"
} >>"$LOG" 2>&1
STATUS=$?

if [[ $STATUS -eq 0 ]]; then
  osascript -e 'display notification "PostAnki reinstalled on your iPhone for another 7 days." with title "iPhone install"'
else
  osascript -e 'display notification "Could not reach the iPhone. Unlock it on home Wi-Fi and rerun apps/ios/scripts/install-iphone.sh." with title "iPhone install failed"'
fi

exit $STATUS
