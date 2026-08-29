#!/usr/bin/env bash
# One-command local dev: start the dev Postgres, migrate, run api + web,
# and tear the DB container down on exit so nothing lingers (data volume kept).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_PID=""

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo "[dev] shutting down..."
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  echo "[dev] stopping dev DB container (data volume kept)..."
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  echo "[dev] done."
}
trap cleanup EXIT INT TERM

echo "[dev] starting dev Postgres (post-anki-dev-db on :5437)..."
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

echo "[dev] launching api (:8030) + web (:3000) — Ctrl+C stops everything."
npm run dev:apps &
APP_PID=$!
wait "$APP_PID"
