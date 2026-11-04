---
type: research
state: done
updated: 2026-10-25
---
# Neon readiness for vector search (prod `main` and `dev` branches)

## Facts (read-only Neon queries, project `postanki` cool-fog-32155538, database `neondb`)
- Both branches run PostgreSQL 17.11 and offer pgvector 0.8.0, pg_trgm 1.6 and pgcrypto 1.3; none is installed yet.
- No `vector` or `halfvec` columns exist on either branch.
- Both databases are about 9-10 MB and hold 2 rows in `drizzle.__drizzle_migrations`, which is the bot's ledger; the API ledger `drizzle.drizzle_migrations_api` holds 27 of 113 migrations on `main` (last applied about 2026-07-31) and 40 on `dev` (last about 2026-07-28); only `plpgsql` is installed on both.
- The API migrations install the extension (`0106`), add and back-fill `embedding_vec` columns and build HNSW indexes (`0107`), then move to `halfvec` (`0109`); a deploy applies them with no manual step.
- Default compute is fixed at 0.25 CU (min and max), with the default suspend setting.
- A labelled backup branch `backup-pre-deploy-2026-10-25` copies `main`.

## Assumptions
- `halfvec` needs pgvector 0.7.0 or newer, so 0.8.0 is enough.
- `PROD_DATABASE_URL` points at `neondb` on `main`.

## Work
1. After the next green deploy, confirm on `main` that `drizzle_migrations_api` holds 113 rows and the `vector` extension is installed.
2. Apply the API migrations to the `dev` branch with the existing migrate script, so local dev against Neon dev matches prod.
3. Check that the embedding index builds within 0.25 CU at current data size; raise max compute only for a one-off index build if it does not.
4. Track storage against the free plan's 0.5 GB: a 1536-dimension `halfvec` row is about 3 KB, so roughly 150k embeddings fit beside the rest of the data.

## Result (2026-10-25 deploy)
- `main` now records 114 API migrations, has pgvector 0.8.0 installed, `embedding_vec` columns on six tables (`halfvec` on four, `vector` on sources and subjects) and HNSW indexes on five; the question-variant index is dropped on purpose by `0109`.
- `dev` is still at 40 migrations and needs the same migrations applied (Neon write, owner's yes).
