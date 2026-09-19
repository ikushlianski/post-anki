#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILES=("$REPO_ROOT/apps/api/.env" "$REPO_ROOT/apps/api/.env.local")

stamp() {
  while IFS= read -r line; do
    printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line"
  done
}

if ! grep -qsE '^NOTION_TOKEN=.+' "${ENV_FILES[@]}"; then
  echo "NOTION_TOKEN not configured in apps/api/.env or .env.local — skipping" | stamp
  exit 0
fi

cd "$REPO_ROOT" || exit 1

npm run notion:sync -w @post-anki/api 2>&1 | stamp
exit "${PIPESTATUS[0]}"
