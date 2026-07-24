#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

set -a
# shellcheck disable=SC1091
source e2e/.env
set +a

export DATABASE_URL="$E2E_DATABASE_URL"

COMPOSE="docker compose"
if ! $COMPOSE version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
fi

echo "▸ starting local e2e Postgres…"
$COMPOSE -f e2e/docker-compose.yml up -d

echo "▸ waiting for Postgres to accept connections…"
for i in $(seq 1 30); do
  if docker exec post-anki-e2e-db pg_isready -U postanki -d postanki_e2e >/dev/null 2>&1; then
    echo "  ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  Postgres did not become ready in time" >&2
    exit 1
  fi
  sleep 1
done

echo "▸ migrating schema into the local e2e DB…"
npm run db:migrate -w @post-anki/api

echo "▸ running Playwright (it boots the e2e api + web on :$E2E_API_PORT / :$E2E_WEB_PORT)…"
VERIFICATION_REPO="${VERIFICATION_REPO:-/Users/ikushlianski/work/verification-repo}"
# Invoke verification-repo's OWN installed @playwright/test binary (not `npx
# playwright`, which would resolve this repo's local copy by cwd) — the test
# files and the config both live in verification-repo and import its copy of
# @playwright/test, so the runner process must be that same copy or Playwright
# refuses to run ("two different versions of @playwright/test").
"$VERIFICATION_REPO/node_modules/.bin/playwright" test -c "$VERIFICATION_REPO/playwright.post-anki.config.ts" "$@"
