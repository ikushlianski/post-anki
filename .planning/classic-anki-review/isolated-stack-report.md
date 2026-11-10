# Isolated stack for browser checks

## What changed for the user
Automated browser checks no longer touch the dev app or the dev database. They run on a separate throwaway stack (own database, API and web on :5550), so no Redis test text appears in the user's data.

## Architecture
- `scripts/e2e-stack.sh up|down|status|env` (npm `e2e:stack:*`): isolated Postgres (:5578), Electric (:5574), offline mock OpenRouter (:4999), API (:5570), web (:5550). Migrations, reference subjects and the 0089 nesting are applied to the isolated database only. It refuses to start when an isolated port equals a dev port, when `E2E_DATABASE_URL` is not the isolated database, or when a port is held by a process it did not start. `down` stops only its own processes (pid files in /tmp) and the isolated containers.
- `scripts/lib/stack-guard.mjs` (+ vitest test, 7 cases): the phone check refuses the dev web/API ports, the dev container and `postanki_dev`; `--use-dev-app` is read-only and cannot be combined with `--seed`.
- `scripts/e2e-mock-openrouter.mjs`: the existing verification-repo mock has no answer for whole-source extraction, so the stack ships a small local mock for the phone-check seed text (not changed in verification-repo).

## Verification
- Dev DB counts before and after a full `--seed` run on the isolated stack are identical: sources 1, bits 2, feedback 2, extraction grades 1, subjects 18.
- Phone, chat overlap and desktop sections: PASS on the isolated stack. Refusals verified: `--use-dev-app --seed` and `APP_URL=http://localhost:5540` both exit 1.
- After `down`, all isolated processes are stopped and dev ports 5540/5560 are still served.

## Code notes
- `scripts/phone-layout-check.mjs`: container/database come from the guard; the seed step uses the new searchable model select (the old native select no longer exists); cleanup calls `scripts/clear-extraction-data.sh` with `CLEAR_DB_CONTAINER`/`CLEAR_DB_NAME` (defaults unchanged for the dev reset).
- Docs: `docs/architecture/phone-layout.md`, `e2e/README.md`. Memory: `browser-checks-use-isolated-stack`.
- The dev database still holds 1 source and 2 cards that were there before this work; they were not touched.

## Review round 1

All findings verified against the code and fixed. Scripts, tests, docs and `.gitignore` only; no commit; dev DB untouched.

**High 1: recycled pid could get an unrelated process group killed (confirmed).** `own_pid` only ran `kill -0`. Now the pid file lives in the git-ignored `.e2e-run/` (added to `.gitignore`) and stores pid, process start time and command line. A pid counts as ours only while the start time still matches, it leads its own process group (started under job control; macOS has no `setsid`), and the command still matches (recorded once the process is ready, after its launcher chain has exec'd). `stop_process` signals only that verified group (TERM, then KILL after 10 s). "Already running" now requires the port listener to be inside our verified group, and a listener outside it makes `up` refuse. A stale pid file is removed, never signalled. While testing I found and fixed a race this introduced: recording the command before the launcher exec'd made the identity check fail and leaked an API process on a failed start; the command is now recorded at ready.

Real output of `bash scripts/e2e-stack-safety-check.sh` (exit 0):
```
PASS stale pid file with a recycled pid leaves the unrelated process alive
PASS stale pid file is removed
PASS matching start time but not a group leader is never signalled
PASS up refuses when a foreign process holds an isolated port
PASS the foreign listener is left running
PASS refuses database URL postgres://postanki:postanki@localhost:5562/postanki_dev
PASS refuses database URL postgres://postanki:postanki@db.neon.tech:5578/postanki_e2e
PASS refuses database URL postgres://postanki:postanki@localhost:5578/postanki_e2e_copy
```

**High 2: guard was a denylist (confirmed).** `scripts/lib/stack-guard.mjs` is now an allowlist: without `--use-dev-app` the origin must be exactly `http://localhost:5550` or `http://127.0.0.1:5550`, the container exactly `post-anki-e2e-db` and the database exactly `postanki_e2e`. `--use-dev-app` allows only the exact dev triple (`http://localhost:5540`, `post-anki-dev-db`, `postanki_dev`) and never with `--seed`. Protocols other than http/https and URLs with userinfo are rejected. `npx vitest run scripts/lib/stack-guard.test.ts`: 30 passed, including proxy host on 80/443, `localhost:5540` without scheme, uppercase, trailing dot, userinfo (both orders), `[::1]` on 5540 and 5550, ftp/file, a container id prefix, container names that start or end with the isolated name, and database name variants.

**Medium (all confirmed, fixed):**
- `E2E_DATABASE_URL` is parsed with `new URL`: host must be localhost or 127.0.0.1, port 5578, path `/postanki_e2e` (three refusal cases above; `E2E_ENV_FILE` can point the script at another env file for that test).
- Every `docker compose` call uses `-p post-anki-e2e`, so `down --remove-orphans` can no longer reach another project named `e2e`. Because container names are fixed, a stack started by `e2e/scripts/run.sh` (project `e2e`) still cannot run at the same time.
- The blind `page.mouse.click(380, 600)` in `scripts/phone-layout-check.mjs` now clicks the drawer's own backdrop, found by selector, and throws when it is missing. The drawer has no dedicated close button or test id; adding one is an app change outside this scope.

**Verification after the fixes:** `up`, then `node scripts/phone-layout-check.mjs --seed` on :5550 printed `PASS: phone, chat overlap and desktop sections verified` (including `ok layer navigation drawer`); `down` left no listener on 5550, 5570 or 4999. Dev DB counts (sources, bits, feedback, extraction grades, subjects) before and after: `1|2|2|1|18` and `1|2|2|1|18`, identical. Dev app on :5540 and API on :5560 still listening.

## Review round 2

Scripts only; no commit; dev DB untouched.

**High: the safety check could orphan or stop the user's real stack (confirmed).** Fixed in four parts:
- (a) `up` now runs `preflight_ports` (mock, API and web ports, plus pid-file state through `own_pid`) before any compose call, so a refusal has no side effects. The safety check asserts the refused `up` created no container and wrote no pid file into the real run dir.
- (b) `scripts/e2e-stack.sh` honours `E2E_RUN_DIR`; the check uses `.e2e-run/safety-check` for its pid files and logs.
- (c) The check refuses to run (exit 2) when any `.e2e-run/*.pid` exists, an isolated port (5550, 5570, 4999, 5574, 5578) is listening, or `post-anki-e2e-db` exists.
- (d) The check sets `E2E_PROCESSES_ONLY=1`, which makes `down` skip every compose call, so it can never touch the shared compose project.

Real output with the real stack up (pid file unchanged before and after, stack still running):
```
refusing to run: the isolated stack is in use or half up (.e2e-run/api.pid .e2e-run/mock.pid .e2e-run/web.pid port-5550 port-5570 port-4999 port-5574 port-5578 container-post-anki-e2e-db). Run npm run e2e:stack:down first.
safety exit 2
api: running on :5570 (pid 93088)     (pid file before and after: 93088|Sun Oct 11 23:43:29 2026|npm exec tsx src/server.ts)
```
With the stack down, `bash scripts/e2e-stack-safety-check.sh` exits 0 with 10 PASS lines (the original 8 plus "the refused up created no container" and "the refused up wrote no pid file into the real run dir") and no container left afterwards.

**Lower, fixed:**
- Cleanup trap: a failed `up` stops the processes this run started and, only when this run created the Postgres container, runs `compose down`. Processes and containers that were already up are left alone. Real output with a failing `npm` shim on the path:
```
▸ migrating the isolated database
up failed (exit 1); stopping what this run started
no e2e containers left
```
- The wait for Postgres health times out after 60 s with `isolated Postgres did not become healthy within 60 s` and the same cleanup.

While editing I clobbered five helper functions with a bad text replacement (the `up() {` match hit `in_own_group() {`), noticed it from the first test run failing with `ensure_port_free_or_ours: command not found`, and restored them before any real run.

**Verification:** `up`, `node scripts/phone-layout-check.mjs --seed` printed `PASS: phone, chat overlap and desktop sections verified`, `down` clean. `npx vitest run scripts/lib/stack-guard.test.ts`: 30 passed. Dev DB counts before and after: `1|2|2|1|18` and `1|2|2|1|18`. Dev app on :5540 and API on :5560 still listening.

## Review round 3

Scripts only; no commit; dev DB untouched; the todo item is not marked by this round.

**Medium 1: racy `sleep 1` before the foreign-listener test (confirmed).** The check now polls `/dev/tcp/127.0.0.1/5570` (up to 5 s) until the test listener accepts connections and asserts that as its own case before calling `up`. `up` itself also refuses when `E2E_PROCESSES_ONLY=1` is set: it still runs the port preflight first (so a busy port gives the port message), then exits with `refusing: E2E_PROCESSES_ONLY is set, so up never starts containers` before any compose call. Two new cases cover it: `up in processes-only mode refuses before any compose call` and `processes-only up created no container`.

**Medium 2: no cleanup on interrupt (confirmed).** The check now has an EXIT trap that stops the `sleep 300` victim and the node listener on 5570 it started and removes `.e2e-run/safety-check`; INT exits 130 and TERM exits 143 through the same trap.

**Verification (real output):**
- Two runs in a row: both exit 0 with 13 PASS lines and no FAIL; after each, 0 listeners on 5550/5570/4999/5574/5578 and no `.e2e-run/safety-check` directory.
- Interrupted mid-way, with the 5570 listener confirmed up before the signal was sent (a real SIGINT and a real SIGTERM, each sent from a Python parent because background shell jobs ignore SIGINT):
```
== SIGINT mid-way: exit 130, lines of output 3
listeners on isolated ports: 0 | sleep300: 0 | rundir exists: False
== SIGTERM mid-way: exit 143, lines of output 3
listeners on isolated ports: 0 | sleep300: 0 | rundir exists: False
no e2e containers
```
- A first attempt to interrupt the check with `kill -INT` from a shell did nothing because non-interactive shells ignore SIGINT for background jobs; the Python-driven run above is the valid test.
- `npx vitest run scripts/lib/stack-guard.test.ts`: 30 passed.
- Dev DB counts after: `1|2|2|1|18`, same as before every round.

END-OF-REPORT
