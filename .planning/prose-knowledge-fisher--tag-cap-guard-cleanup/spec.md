---
type: spec
branch: learn-from-doc-site
task: prose-knowledge-fisher--tag-cap-guard-cleanup
stakes-tier: Briefed
updated: 2026-09-24
---

# The ask

Three structured-verdict findings against the already-merged tag-cap-guard work
(`apps/api/src/tag/tag.repo.ts`) need fixing: a broken race-recovery path inside a held
transaction, an unhandled throw that skips a documented fallback, and a file over this repo's
300-line cap.

# What to do

**1 — `resolveOrCreateTag`'s race recovery breaks inside an already-open transaction.**

Current code (`tag.repo.ts:47-83`) does `try { insert } catch { re-select }`. When `db` is the
pool, a real unique-violation on `tags.normalized_name` (unique index, `db/schema.ts:799`) is a
normal, isolated error — the re-select works fine. But when `db` is the `tx` handed down from
`resolveTagUnderCapGuard`'s `withNamedLock` (`tag.repo.ts:107,135,139`), a genuine
unique-violation aborts the *whole* transaction (Postgres 25P02) — the re-select inside the
`catch`, still running on that same aborted `tx`, throws instead of recovering.

Fix: wrap the insert in a nested `db.transaction(async (nestedTx) => { await
nestedTx.insert(tags).values(row); })`. `drizzle-orm/node-postgres` implements a nested
`.transaction()` call as a real `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` — when the insert throws, only
the savepoint rolls back, and the outer transaction (the pool, or the guard's held `tx`) stays
usable for the following re-select. This works identically whether `db` is the pool or an open
`tx`, so `resolveOrCreateTag`'s existing signature (`db: DbExecutor = getDb()`) doesn't need to
change. Confirm this codebase's drizzle-orm version actually supports nested transactions as
savepoints on the `node-postgres` dialect before relying on it (check `node_modules/drizzle-orm`'s
version and its `PgTransaction`/`PgNestedTransaction` — this is a documented, stable feature, not
speculative, but verify against the pinned version).

**2 — `resolveTagUnderCapGuard`'s forced-matcher call has no try/catch.**

`tag.repo.ts:142-147` calls `matcher(...)` with `forceMatch: true` and no error handling. If the
matcher throws (the underlying LLM call errors, times out, or returns malformed output the matcher
itself rejects), the throw propagates out of `resolveTagUnderCapGuard` entirely, defeating the
documented "array order is only ever a last-resort fallback if the forced call itself fails"
contract (this file's own docstring, `tag.repo.ts:96-100`).

Fix: wrap the `matcher(...)` call in `try { ... } catch { return freshTags[0]!; }` — a thrown error
is exactly the "forced call failed" case already documented, so it should fall through to the same
last-resort as a matcher that merely returns a non-member name.

**3 — `tag.repo.ts` is 375 lines, over this repo's 300-line file cap.**

Move `resolveTagUnderCapGuard`, its `MatchClosestTagFn` type export, and the
`TAG_TAXONOMY_CAP_LOCK_KEY` constant into a new sibling file, `apps/api/src/tag/tag-cap-guard.repo.ts`.
It already only depends on `listTags`, `resolveOrCreateTag` (both exported from `tag.repo.ts`),
`withNamedLock` (`../shared/merge-lock.js`), `matchClosestTag` (`./match-closest-tag.js`), and
`isUnderTaxonomyCap`/`normalizeTagName` (`@post-anki/core`) — import the first two from
`tag.repo.ts` rather than duplicating them. Update the two importers
(`apps/api/src/tag/tag-auto-assign.ts` and `apps/api/src/tag/tag-taxonomy-cap-concurrency.integration.test.ts`)
to import `resolveTagUnderCapGuard`/`MatchClosestTagFn` from the new file instead of `tag.repo.ts`.
`tag.repo.ts` drops back to roughly 320 lines after the move; if still over 300, `mergeTags`
(`tag.repo.ts:320-374`, already logically self-contained) is the next-best candidate to relocate,
but only do that second move if the guard-logic move alone doesn't clear the cap.

# Files to touch

- `apps/api/src/tag/tag.repo.ts` — apply fix 1, remove the relocated guard logic (fix 3)
- `apps/api/src/tag/tag-cap-guard.repo.ts` — new file, houses `resolveTagUnderCapGuard` + fix 2
- `apps/api/src/tag/tag-auto-assign.ts` — update its `resolveTagUnderCapGuard`/`MatchClosestTagFn` import path
- `apps/api/src/tag/tag-taxonomy-cap-concurrency.integration.test.ts` — update import path; add
  coverage per scenarios.md
- `apps/api/src/tag/tag.repo.test.ts` or a new `apps/api/src/tag/tag-cap-guard.repo.test.ts` — new
  unit coverage for fix 2 (forced-matcher-throws)

# Done when

- `npx tsc --noEmit` clean for `packages/core` and `apps/api`.
- `npx vitest run src/tag` clean in both packages.
- The concurrency integration test (`npm run e2e:db:up`, migrate, then `npx vitest run --config
  vitest.integration.config.ts src/tag` with a real `OPENROUTER_API_KEY`) passes, including the new
  scenario from scenarios.md.
- `wc -l apps/api/src/tag/tag.repo.ts` reports ≤ 300.
- Every scenario in `scenarios.md` has a real, passing, non-skipped test citation.
