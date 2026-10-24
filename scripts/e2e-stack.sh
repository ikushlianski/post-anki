#!/usr/bin/env bash
# Isolated stack for browser checks: own Postgres (:5578), Electric (:5574), mock OpenRouter (:4999), API (:5570), web (:5550).
# Never touches the dev app (:5540/:5560) or the dev database (:5562). Usage: e2e-stack.sh up|down|status|env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

set -a
# shellcheck disable=SC1091
source "${E2E_ENV_FILE:-e2e/.env}"
set +a

DEV_PORTS="5540 5560 5561 5562"
API_PORT="${E2E_API_PORT:-5570}"
WEB_PORT="${E2E_WEB_PORT:-5550}"
MOCK_PORT="${E2E_MOCK_LLM_PORT:-4999}"
ELECTRIC_PORT="${E2E_ELECTRIC_PORT:-5574}"
DB_PORT=5578
RUN_DIR="${E2E_RUN_DIR:-$ROOT/.e2e-run}"
COMPOSE="docker compose -p post-anki-e2e -f e2e/docker-compose.yml"
mkdir -p "$RUN_DIR"

for port in "$API_PORT" "$WEB_PORT" "$MOCK_PORT" "$ELECTRIC_PORT" "$DB_PORT"; do
  for dev in $DEV_PORTS; do
    if [ "$port" = "$dev" ]; then
      echo "refusing: isolated port $port equals a dev port" >&2
      exit 1
    fi
  done
done

if ! node -e '
const url = new URL(process.env.E2E_DATABASE_URL);
const ok = ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "5578" && url.pathname === "/postanki_e2e";
process.exit(ok ? 0 : 1);
' 2>/dev/null; then
  echo "refusing: E2E_DATABASE_URL is not the isolated database (host localhost or 127.0.0.1, port 5578, database postanki_e2e)" >&2
  exit 1
fi

pid_file() { echo "$RUN_DIR/$1.pid"; }
log_file() { echo "$RUN_DIR/$1.log"; }

STARTED_NAMES=()
COMPOSE_CREATED_BY_THIS_RUN=0

port_holder() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

proc_field() { ps -o "$1=" -p "$2" 2>/dev/null | sed 's/^ *//;s/ *$//' || true; }

# The pid file holds: pid, process start time, command line. A pid is only ours while all three still match
# (the command is recorded once the process is ready, after its launcher chain has exec'd) and the process leads its own group, so a recycled pid is never signalled.
record_identity() {
  local name="$1" pid="$2" command="${3:-}"
  printf '%s|%s|%s\n' "$pid" "$(proc_field lstart "$pid")" "$command" > "$(pid_file "$name")"
}

own_pid() {
  local file pid started command
  file="$(pid_file "$1")"

  [ -f "$file" ] || return 0

  IFS='|' read -r pid started command < "$file" || true

  if [ -n "$pid" ] && [ "$(proc_field lstart "$pid")" = "$started" ] && [ "$(proc_field pgid "$pid")" = "$pid" ] \
    && { [ -z "$command" ] || [ "$(proc_field command "$pid")" = "$command" ]; }; then
    echo "$pid"
  else
    rm -f "$file"
  fi
}

in_own_group() {
  local holder="$1" own="$2"

  [ -n "$holder" ] && [ -n "$own" ] && [ "$(proc_field pgid "$holder")" = "$own" ]
}

ensure_port_free_or_ours() {
  local name="$1" port="$2" holder
  holder="$(port_holder "$port")"

  if [ -n "$holder" ] && ! in_own_group "$holder" "$(own_pid "$name")"; then
    echo "refusing: port $port is held by a process this script did not start (pid $holder)" >&2
    exit 1
  fi
}

kill_own_group() {
  local pid="$1"

  kill -TERM -- "-$pid" 2>/dev/null || true

  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done

  kill -KILL -- "-$pid" 2>/dev/null || true
}

start_process() {
  local name="$1" port="$2" health="$3" pid
  shift 3

  ensure_port_free_or_ours "$name" "$port"

  pid="$(own_pid "$name")"

  if [ -n "$pid" ] && in_own_group "$(port_holder "$port")" "$pid"; then
    echo "  $name already running"
    return
  fi

  if [ -n "$pid" ]; then
    kill_own_group "$pid"
    rm -f "$(pid_file "$name")"
  fi

  : > "$(log_file "$name")"
  STARTED_NAMES+=("$name")
  (
    set -m
    "$@" >> "$(log_file "$name")" 2>&1 &
    record_identity "$name" "$!"
  )

  pid="$(own_pid "$name")"

  for _ in $(seq 1 90); do
    if curl -sf "$health" >/dev/null 2>&1 && in_own_group "$(port_holder "$port")" "$pid"; then
      record_identity "$name" "$pid" "$(proc_field command "$pid")"
      echo "  $name ready on :$port"
      return
    fi
    sleep 1
  done

  echo "$name did not become ready; see $(log_file "$name")" >&2
  [ -n "$pid" ] && kill_own_group "$pid"
  rm -f "$(pid_file "$name")"
  exit 1
}

stop_process() {
  local name="$1" pid
  pid="$(own_pid "$name")"

  if [ -n "$pid" ]; then
    kill_own_group "$pid"
    echo "  stopped $name"
  fi

  rm -f "$(pid_file "$name")"
}

psql_e2e() { docker exec -i post-anki-e2e-db psql -U postanki -d postanki_e2e -v ON_ERROR_STOP=1 "$@"; }

cleanup_failed_up() {
  local status=$?
  trap - EXIT

  if [ "$status" -ne 0 ]; then
    echo "up failed (exit $status); stopping what this run started" >&2

    for name in "${STARTED_NAMES[@]:-}"; do
      [ -n "$name" ] && stop_process "$name" >&2
    done

    if [ "$COMPOSE_CREATED_BY_THIS_RUN" = "1" ]; then
      $COMPOSE down --remove-orphans >/dev/null 2>&1 || true
    fi
  fi

  exit "$status"
}

preflight_ports() {
  for entry in "mock:$MOCK_PORT" "api:$API_PORT" "web:$WEB_PORT"; do
    ensure_port_free_or_ours "${entry%%:*}" "${entry##*:}"
  done
}

wait_for_database() {
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' post-anki-e2e-db 2>/dev/null)" = "healthy" ] && return 0
    sleep 1
  done

  echo "isolated Postgres did not become healthy within 60 s" >&2
  return 1
}

up() {
  preflight_ports

  if [ "${E2E_PROCESSES_ONLY:-0}" = "1" ]; then
    echo "refusing: E2E_PROCESSES_ONLY is set, so up never starts containers" >&2
    exit 1
  fi

  if ! docker inspect post-anki-e2e-db >/dev/null 2>&1; then
    COMPOSE_CREATED_BY_THIS_RUN=1
  fi

  trap cleanup_failed_up EXIT

  echo "▸ starting isolated Postgres and Electric"
  $COMPOSE up -d postgres
  wait_for_database

  echo "▸ migrating the isolated database"
  DATABASE_URL="$E2E_DATABASE_URL" npm run db:migrate -w @post-anki/api >> "$(log_file migrate)" 2>&1

  if [ "$(psql_e2e -Atc "select count(*) from subjects")" = "0" ]; then
    echo "▸ seeding reference subjects and nesting into the isolated database"
    DATABASE_URL="$E2E_DATABASE_URL" npm run db:seed:subjects -w @post-anki/api >> "$(log_file migrate)" 2>&1
    psql_e2e < apps/api/src/db/migrations/0089_nest-subjects-under-parents.sql >> "$(log_file migrate)" 2>&1
  fi

  $COMPOSE up -d electric

  echo "▸ starting mock OpenRouter, API and web"
  start_process mock "$MOCK_PORT" "http://127.0.0.1:$MOCK_PORT/healthz" \
    env PORT="$MOCK_PORT" node scripts/e2e-mock-openrouter.mjs
  start_process api "$API_PORT" "http://127.0.0.1:$API_PORT/_healthz" \
    env PORT="$API_PORT" DATABASE_URL="$E2E_DATABASE_URL" API_SHARED_SECRET="$API_SHARED_SECRET" \
      OPENROUTER_API_KEY=e2e-unused OPENROUTER_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
      ELECTRIC_SERVICE_URL="http://127.0.0.1:$ELECTRIC_PORT" ELECTRIC_AUTH_MODE=none \
      LANGFUSE_PUBLIC_KEY= LANGFUSE_SECRET_KEY= LOG_LEVEL=warn \
      bash -c "cd apps/api && exec npx tsx src/server.ts"
  start_process web "$WEB_PORT" "http://localhost:$WEB_PORT/" \
    env E2E_WEB_PORT="$WEB_PORT" API_BASE_URL="http://127.0.0.1:$API_PORT" API_SHARED_SECRET="$API_SHARED_SECRET" \
      bash -c "cd apps/web && exec npm run dev:e2e"

  echo "isolated stack ready: http://localhost:$WEB_PORT"
}

down() {
  echo "▸ stopping only the isolated stack"
  stop_process web
  stop_process api
  stop_process mock

  if [ "${E2E_PROCESSES_ONLY:-0}" = "1" ]; then
    return
  fi

  $COMPOSE down --remove-orphans >/dev/null 2>&1 || true
  echo "  isolated Postgres and Electric stopped (data is discarded)"
}

status() {
  for entry in "mock:$MOCK_PORT" "api:$API_PORT" "web:$WEB_PORT"; do
    local name="${entry%%:*}" port="${entry##*:}"

    if in_own_group "$(port_holder "$port")" "$(own_pid "$name")"; then
      echo "$name: running on :$port (pid $(own_pid "$name"))"
    elif [ -n "$(port_holder "$port")" ]; then
      echo "$name: port $port held by a foreign process"
    else
      echo "$name: stopped"
    fi
  done

  echo "database: $(docker inspect -f '{{.State.Status}}' post-anki-e2e-db 2>/dev/null || echo stopped)"
}

env_out() {
  echo "APP_URL=http://localhost:$WEB_PORT"
  echo "CHECK_DB_CONTAINER=post-anki-e2e-db"
  echo "CHECK_DB_NAME=postanki_e2e"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  env) env_out ;;
  *) echo "usage: e2e-stack.sh up|down|status|env" >&2; exit 2 ;;
esac
