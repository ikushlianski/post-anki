#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${PORT:-5560}"
LOG="${TMPDIR:-/tmp}/post-anki-api.log"

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  docker start post-anki-dev-db >/dev/null 2>&1 || (cd "$ROOT" && docker compose up -d postgres >/dev/null)

  (cd "$ROOT" && nohup npm run dev:api >"$LOG" 2>&1 &)

  for _ in $(seq 1 60); do
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done

  if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "API did not start on port $PORT, see $LOG" >&2
    exit 1
  fi
fi

exec bash "$ROOT/apps/ios/scripts/run-mac.sh"
