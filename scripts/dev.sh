#!/usr/bin/env bash
# One-command local dev: start the dev Postgres, migrate, run api + web,
# and tear the DB container down on exit so nothing lingers (data volume kept).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_PID=""
MOCK_PID=""

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo "[dev] shutting down..."
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "$MOCK_PID" ]; then
    kill "$MOCK_PID" 2>/dev/null || true
  fi
  echo "[dev] stopping dev DB container (data volume kept)..."
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  echo "[dev] done."
}
trap cleanup EXIT INT TERM

echo "[dev] starting dev Postgres (post-anki-dev-db on :5562)..."
docker compose up -d

echo "[dev] waiting for Postgres to be healthy..."
until [ "$(docker inspect -f '{{.State.Health.Status}}' post-anki-dev-db 2>/dev/null)" = "healthy" ]; do
  sleep 1
done

echo "[dev] applying migrations..."
npm run db:migrate:api

# Electric caches Postgres's schema at connect time. If it was already running
# from a prior session, a migration applied just now (new/changed columns) is
# invisible to it until it reconnects — shape requests then 400 with
# "unknown reference <column>". Restarting it here after every migrate run
# keeps it correct with zero manual steps. See docs/memories/local-dev-env.md.
echo "[dev] restarting Electric to pick up any schema changes..."
docker compose restart electric >/dev/null 2>&1 || true
until [ "$(docker inspect -f '{{.State.Health.Status}}' post-anki-dev-electric 2>/dev/null)" = "healthy" ]; do
  sleep 1
done

# apps/web's `dev` script reads WEB_PORT via shell substitution
# (`vite dev --port ${WEB_PORT:-5540}`), which resolves before vite itself
# ever loads apps/web/.env.local — so if a developer has localized their
# ports (e.g. via `devports localize post-anki`), it has to be exported into
# THIS shell before npm run dev:apps starts, not left for vite to pick up on
# its own. No file present (the common case) means WEB_PORT stays unset and
# the script's own `:5540` default applies, unchanged from before.
if [ -f apps/web/.env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source apps/web/.env.local
  set +a
fi

WEB_PORT="${WEB_PORT:-5540}"

# The api process loads apps/api/.env.local itself (Node's own --env-file
# flag, in apps/api/package.json's dev script) — it is never sourced into
# THIS shell, since that file also carries real secrets (OPENROUTER_API_KEY,
# Langfuse keys) that a top-level `dev.sh` process has no reason to hold.
# Only its PORT line (if any) is worth reading here, purely to report the
# right number below.
API_PORT="$(grep -E '^PORT=' apps/api/.env.local 2>/dev/null | tail -1 | cut -d= -f2)"
API_PORT="${API_PORT:-5560}"

# Gate role (devports/SKILL-CONTRACT.md): catch a localized .env.local drifting out of
# sync with the machine-local port registry — the registry's own copy of these numbers
# is a duplicate, not the source of truth, and it went stale silently for weeks before
# `devports check` caught it on 2026-09-12. This never decides a port itself, never
# fails the build, and is a total no-op on a machine with no registry installed (RC=3).
DEVPORTS="$HOME/.claude/devports/cli.mjs"
if [ -f "$DEVPORTS" ]; then
  for envfile in apps/api/.env.local apps/web/.env.local; do
    [ -f "$envfile" ] || continue
    CHECK_JSON="$(node "$DEVPORTS" check post-anki --envfile "$envfile" --json 2>/dev/null)" || true
    MISMATCH_COUNT="$(printf '%s' "$CHECK_JSON" | node -e '
      let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
        try{const j=JSON.parse(d);console.log((j.mismatches||[]).length);}catch{console.log(0);}
      });' 2>/dev/null)"
    if [ "${MISMATCH_COUNT:-0}" -gt 0 ] 2>/dev/null; then
      echo "[dev] WARNING: $envfile has drifted from devports' registry — run \`devports localize post-anki\` or update registry.toml:"
      printf '%s' "$CHECK_JSON" | node -e '
        let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
          const j=JSON.parse(d);
          for (const m of j.mismatches) console.log(`  ${m.env}=${m.actual} (registry expects ${m.expected} for role ${m.role})`);
        });'
    fi
  done
fi

# LLM_MODE=mock (shell, apps/api/.env or .env.local) starts the offline mock LLM; the API then needs no OpenRouter key.
env_value() { grep -hE "^$1=" apps/api/.env apps/api/.env.local 2>/dev/null | tail -1 | cut -d= -f2; }
LLM_MODE="${LLM_MODE:-$(env_value LLM_MODE)}"
if [ "${LLM_MODE:-real}" = "mock" ]; then
  MOCK_LLM_PORT="${MOCK_LLM_PORT:-$(env_value MOCK_LLM_PORT)}"
  MOCK_LLM_PORT="${MOCK_LLM_PORT:-4989}"
  echo "[dev] LLM_MODE=mock — starting mock LLM on :$MOCK_LLM_PORT (no OpenRouter calls, no cost)."
  MOCK_LLM_PORT="$MOCK_LLM_PORT" node scripts/mock-llm.mjs &
  MOCK_PID=$!
  export LLM_MODE MOCK_LLM_PORT
fi

echo "[dev] launching api (:$API_PORT) + web (:$WEB_PORT) — Ctrl+C stops everything."
npm run dev:apps &
APP_PID=$!
wait "$APP_PID"
