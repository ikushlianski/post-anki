# Local dev environment — Postgres + Electric

## 2026-08-21 — Electric was syncing from the wrong database entirely

**Symptom:** browser showed subjects/curricula that didn't exist in the local dev Postgres
(`postanki_dev`), and Electric's shape endpoint 400'd with `unknown reference
container_area_node_id` right after a fresh migration.

**Root cause:** `docker-compose.yml`'s `electric` service reads `DATABASE_URL:
${ELECTRIC_DATABASE_URL}` from repo-root `.env` via Compose variable substitution. That `.env`
value (documented at `.env:5-11`) points at Neon's cloud **dev branch**, not the local Docker
Postgres container the API actually uses (`apps/api/.env.local` overrides `DATABASE_URL` to
`postgresql://postanki:postanki@localhost:5437/postanki_dev`, but nothing ever overrode
`ELECTRIC_DATABASE_URL` to match). So Electric had been replicating a completely different
database — real rows from Neon's dev branch appeared in the browser, and a migration applied only
to local Docker Postgres was invisible to Electric's connection, hence the 400.

**Fix:** `docker-compose.override.yml` (auto-loaded by `docker compose up` with no extra flags,
gitignored-safe since it's dev-only) pins the `electric` service's `DATABASE_URL` to the local
Postgres container over the Compose network (`postgresql://postanki:postanki@postgres:5432/postanki_dev`
— note the Docker service hostname `postgres`, not `localhost`, since Electric runs in its own
container). Root `.env`'s `ELECTRIC_DATABASE_URL` is left as-is; it's not wrong for other uses,
just not what local dev should use for Electric.

**Standing gotcha, now automated away:** even with the right connection string, Electric caches
Postgres's schema at connect time. If it's already running from a prior session and a migration
adds/changes a column, Electric's shape queries 400 with `unknown reference <column>` until it
reconnects. `scripts/dev.sh` now restarts the `electric` container after every
`npm run db:migrate:api` run, so this self-heals on every `npm run dev` — no manual `docker
restart post-anki-dev-electric` needed anymore.

**If this ever recurs:** check `docker logs post-anki-dev-electric | grep "Connection pool"` — it
prints the actual Postgres host it connected to. If that's not `postgres:5432` (the local
container), the override file isn't being picked up (check you're running `docker compose` from
the repo root, where the override file lives).
