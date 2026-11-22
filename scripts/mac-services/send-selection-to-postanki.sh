#!/bin/bash
# Reads selected text on stdin and saves it to Post Anki as a pending source.
# The token comes from the first line of ~/Library/Application Support/PostAnki/token-command (mode 600).
# POSTANKI_DRY_RUN=1 prints the body length and target URL only.
set -u

BASE_URL="${POSTANKI_URL:-https://postanki.ilya.online}"
SUPPORT_DIR="$HOME/Library/Application Support/PostAnki"
TOKEN_COMMAND_FILE="$SUPPORT_DIR/token-command"
MAX_CHARS=50000

notify() {
  /usr/bin/osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Post Anki"' -e 'end run' "$1" >/dev/null 2>&1
}

fail() {
  notify "$1"
  echo "$1" >&2
  exit 1
}

TEXT="$(cat)"
TEXT="$(printf '%s' "$TEXT" | /usr/bin/python3 -I -c 'import sys; sys.stdout.write(sys.stdin.read().strip())')"

[ -n "$TEXT" ] || fail "There is no text to save."

LENGTH="$(printf '%s' "$TEXT" | /usr/bin/python3 -I -c 'import sys; sys.stdout.write(str(len(sys.stdin.read())))')"

[ "$LENGTH" -le "$MAX_CHARS" ] || fail "This text is too long (over 50,000 characters). Select less and try again."

BODY="$(printf '%s' "$TEXT" | /usr/bin/python3 -I -c 'import json, sys; sys.stdout.write(json.dumps({"text": sys.stdin.read()}))')"

if [ "${POSTANKI_DRY_RUN:-0}" = "1" ]; then
  echo "body_length=${#BODY} url=$BASE_URL/knowledge-sources"
  exit 0
fi

[ -f "$TOKEN_COMMAND_FILE" ] || fail "Token command missing. See docs/send-selection-to-post-anki.md."

MODE="$(/usr/bin/stat -f '%Lp' "$TOKEN_COMMAND_FILE")"
OWNER="$(/usr/bin/stat -f '%u' "$TOKEN_COMMAND_FILE")"

if [ "$MODE" != "600" ] || [ "$OWNER" != "$(id -u)" ]; then
  fail "Token command file must be private (mode 600) and yours."
fi

TOKEN="$(/bin/sh -c "$(head -n 1 "$TOKEN_COMMAND_FILE")" 2>/dev/null)"

[ -n "$TOKEN" ] || fail "Token command printed nothing."

STATUS="$(printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$TOKEN" |
  /usr/bin/curl -sS -K - --max-time 20 -o /dev/null -w '%{http_code}' -X POST --data-binary "$BODY" \
    "$BASE_URL/knowledge-sources" 2>/dev/null)"

unset TOKEN

case "$STATUS" in
  2??) notify "Saved to Post Anki. It will be sorted into a subject for you." ;;
  401|403) fail "Sign-in token rejected. Check the token and its scope." ;;
  000) fail "Couldn't reach Post Anki. Check your connection and try again." ;;
  *) fail "Couldn't save that. Try again in a moment." ;;
esac
