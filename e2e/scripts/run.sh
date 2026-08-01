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

# Reset the e2e database on every run. Without this, rows from previous runs
# accumulate and later runs fail in a way that looks like a code regression but
# isn't: setup steps navigate to entities that no longer line up, the app 404s,
# and the test times out waiting for a form that never renders. That cost a full
# triage cycle on 2026-08-01 — five merge tests "failed", all five passed against
# a clean database, nothing was actually broken.
#
# Electric holds a logical replication slot on this database, and Postgres
# refuses to drop a database while a slot is attached ("is used by an active
# logical replication slot"), so the container has to come down and the slot has
# to be released first. Electric goes back up before Playwright starts, since the
# board and practice screens read through it.
echo "▸ resetting the local e2e DB (drops accumulated state from previous runs)…"
docker stop post-anki-e2e-electric >/dev/null 2>&1 || true
docker exec post-anki-e2e-db psql -U postanki -d postgres -qtc \
  "SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE database='postanki_e2e';" >/dev/null 2>&1 || true
docker exec post-anki-e2e-db psql -U postanki -d postgres -qtc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postanki_e2e' AND pid<>pg_backend_pid();" >/dev/null 2>&1 || true
docker exec post-anki-e2e-db psql -U postanki -d postgres -qc "DROP DATABASE IF EXISTS postanki_e2e;" >/dev/null
docker exec post-anki-e2e-db psql -U postanki -d postgres -qc "CREATE DATABASE postanki_e2e;" >/dev/null
echo "  reset"

echo "▸ migrating schema into the local e2e DB…"
npm run db:migrate -w @post-anki/api

echo "▸ restarting Electric against the fresh database…"
$COMPOSE -f e2e/docker-compose.yml up -d electric
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${E2E_ELECTRIC_PORT:-3011}/v1/health" >/dev/null 2>&1; then
    echo "  ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  Electric did not become ready in time" >&2
    exit 1
  fi
  sleep 1
done

echo "▸ running Playwright (it boots the e2e api + web on :$E2E_API_PORT / :$E2E_WEB_PORT)…"
VERIFICATION_REPO="${VERIFICATION_REPO:-/Users/ikushlianski/work/verification-repo}"
# Invoke verification-repo's OWN installed @playwright/test binary (not `npx
# playwright`, which would resolve this repo's local copy by cwd) — the test
# files and the config both live in verification-repo and import its copy of
# @playwright/test, so the runner process must be that same copy or Playwright
# refuses to run ("two different versions of @playwright/test").
"$VERIFICATION_REPO/node_modules/.bin/playwright" test -c "$VERIFICATION_REPO/playwright.post-anki.config.ts" "$@"
