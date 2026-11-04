#!/usr/bin/env bash
set -euo pipefail

LABEL="com.ikushlianski.postanki-iphone-install"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "$0")" && pwd)"
HOUR="${1:-23}"
MINUTE="${2:-50}"
WEEKDAYS="${3:-0 3}"

INTERVALS=""

for DAY in $WEEKDAYS; do
  INTERVALS+="    <dict><key>Weekday</key><integer>$DAY</integer><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>
"
done

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$HERE/scheduled-iphone-install.sh</string></array>
  <key>StartCalendarInterval</key>
  <array>
$INTERVALS  </array>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scheduled: weekdays [$WEEKDAYS] (0=Sunday) at $HOUR:$MINUTE. Log: ~/Library/Logs/postanki-iphone-install.log"
echo "Remove with: launchctl bootout gui/$(id -u)/$LABEL && rm $PLIST"
