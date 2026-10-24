#!/usr/bin/env bash
# Manual safety check (own run dir under .e2e-run/safety-check, never calls compose; refuses when the real stack is up)
# for scripts/e2e-stack.sh: a stale pid file must never get an unrelated process killed,
# and a foreign listener on an isolated port must make `up` refuse. Needs no containers. Prints PASS/FAIL per case.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FAILS=0

busy=""

for pidfile in .e2e-run/*.pid; do
  [ -e "$pidfile" ] && busy="$busy $pidfile"
done

for port in 5550 5570 4999 5574 5578; do
  [ -n "$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)" ] && busy="$busy port-$port"
done

docker inspect post-anki-e2e-db >/dev/null 2>&1 && busy="$busy container-post-anki-e2e-db"

if [ -n "$busy" ]; then
  echo "refusing to run: the isolated stack is in use or half up (${busy# }). Run npm run e2e:stack:down first." >&2
  exit 2
fi

export E2E_RUN_DIR="$ROOT/.e2e-run/safety-check"
export E2E_PROCESSES_ONLY=1
rm -rf "$E2E_RUN_DIR"
mkdir -p "$E2E_RUN_DIR"

VICTIM=""
FOREIGN=""

cleanup() {
  [ -n "$VICTIM" ] && kill "$VICTIM" 2>/dev/null
  [ -n "$FOREIGN" ] && kill "$FOREIGN" 2>/dev/null
  rm -rf "$E2E_RUN_DIR"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

check() { if [ "$2" = "0" ]; then echo "PASS $1"; else echo "FAIL $1"; FAILS=$((FAILS + 1)); fi; }

sleep 300 &
VICTIM=$!
echo "$VICTIM|Thu Jan  1 00:00:00 1970|sleep 300" > "$E2E_RUN_DIR/api.pid"
bash scripts/e2e-stack.sh down >/dev/null 2>&1
kill -0 "$VICTIM" 2>/dev/null; check "stale pid file with a recycled pid leaves the unrelated process alive" $?
[ ! -f "$E2E_RUN_DIR/api.pid" ]; check "stale pid file is removed" $?

echo "$VICTIM|$(ps -o lstart= -p "$VICTIM" | sed 's/^ *//;s/ *$//')|sleep 300" > "$E2E_RUN_DIR/web.pid"
bash scripts/e2e-stack.sh down >/dev/null 2>&1
kill -0 "$VICTIM" 2>/dev/null; check "matching start time but not a group leader is never signalled" $?
kill "$VICTIM" 2>/dev/null
VICTIM=""

node -e 'require("http").createServer().listen(5570, "127.0.0.1")' &
FOREIGN=$!

for _ in $(seq 1 50); do
  (exec 3<>/dev/tcp/127.0.0.1/5570) 2>/dev/null && break
  sleep 0.1
done

(exec 3<>/dev/tcp/127.0.0.1/5570) 2>/dev/null; check "the test listener on 5570 accepts connections before up is called" $?
OUT="$(bash scripts/e2e-stack.sh up 2>&1 < /dev/null | tail -1)"
[[ "$OUT" == *"held by a process this script did not start"* ]]; check "up refuses when a foreign process holds an isolated port" $?
kill -0 "$FOREIGN" 2>/dev/null; check "the foreign listener is left running" $?
kill "$FOREIGN" 2>/dev/null
FOREIGN=""
[ -z "$(docker inspect -f '{{.Name}}' post-anki-e2e-db post-anki-e2e-electric 2>/dev/null)" ]; check "the refused up created no container" $?
[ ! -f .e2e-run/api.pid ] && [ ! -f .e2e-run/mock.pid ]; check "the refused up wrote no pid file into the real run dir" $?

OUT="$(bash scripts/e2e-stack.sh up 2>&1 < /dev/null | tail -1)"
[[ "$OUT" == *"E2E_PROCESSES_ONLY is set"* ]]; check "up in processes-only mode refuses before any compose call" $?
[ -z "$(docker inspect -f '{{.Name}}' post-anki-e2e-db 2>/dev/null)" ]; check "processes-only up created no container" $?

for url in "postgres://postanki:postanki@localhost:5562/postanki_dev" "postgres://postanki:postanki@db.neon.tech:5578/postanki_e2e" "postgres://postanki:postanki@localhost:5578/postanki_e2e_copy"; do
  { sed 's#^E2E_DATABASE_URL=.*#E2E_DATABASE_URL='"$url"'#' e2e/.env; } > "$E2E_RUN_DIR/bad.env"
  OUT="$(E2E_ENV_FILE="$E2E_RUN_DIR/bad.env" bash scripts/e2e-stack.sh status 2>&1)"
  [[ "$OUT" == *"refusing: E2E_DATABASE_URL"* ]]; check "refuses database URL $url" $?
done
rm -f "$E2E_RUN_DIR/bad.env"

exit "$FAILS"
