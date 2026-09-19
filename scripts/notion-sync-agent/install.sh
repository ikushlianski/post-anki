#!/usr/bin/env bash
set -euo pipefail

LABEL="com.postanki.notion-sync"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LOG_DIR="$HOME/Library/Logs/post-anki"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_BIN="$(dirname "$(command -v node)")"
DOMAIN="gui/$(id -u)"

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

sed \
  -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__HOME__|$HOME|g" \
  "$HERE/$LABEL.plist" > "$PLIST.tmp"

plutil -lint "$PLIST.tmp"
mv "$PLIST.tmp" "$PLIST"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "Installed $LABEL (every 15 min while this Mac is on)."
echo "Status: launchctl print $DOMAIN/$LABEL"
echo "Log:    $LOG_DIR/notion-sync.log"
