# Run todo — moonshine 2026-08-01

Live picture of what's still open. `LOG.md` is the narrative of what happened; this file is
what's left. Check a box the moment its step lands, not batched at the end.
(The previous run's checklist, now fully superseded, is at `todo-archive-2026-07.md`.)

## Decisions to make

- [ ] Turn on Electric sync in production? It means a permanently-warm Cloud Run service
      (`minScale: 1`, CPU throttling off), unlike the other three which scale to zero. Code
      and deploy wiring are both ready; the `PROD_ELECTRIC_ENABLED` repository variable is
      the switch. Deliberately left off.
- [ ] Add split (subject/course/tag). The wishlist entry says outright it needs real
      product/architecture planning first — how the split UI decides which children go
      where. Not a moonshine unit; route through `/plan-ie` before building.

## To review / clarify

- [ ] The Electric Cloud Run service in production has been crash-looping since 2026-07-18
      and may have been billing that whole time (`minScale: 1`, CPU throttling off; every
      revision fails to start because `electricDatabaseUrl` was never set on the Pulumi prod
      stack). Check billing; decide whether to configure it or remove it from `infra/index.ts`.
- [ ] The Neon **dev** branch is behind on migrations — loading the board locally fails with
      `column "embedding" does not exist` / `relation "subject_duplicate_suggestions" does
      not exist`, from ai-duplicate-detection merged 2026-07-31. Not touched autonomously
      because it mutates a cloud database.
- [x] Four DB-backed api tests currently run under NEITHER vitest config, so they are silently
      not executing: `decide.orchestrator.test.ts`, `decide.repo.test.ts`,
      `doc-scan.orchestrator.test.ts`, `domain-priority-review.orchestrator.test.ts`. They are
      named in `vitest.config.ts`'s `exclude` but absent from `vitest.integration.config.ts`'s
      `include`; that config's comment claims "an explicit CLI path bypasses exclude", which is
      empirically false on vitest 2.1.9 (`No test files found` from both configs). Fix: add the
      four paths to the integration config's `include`.
      [→ done 2026-08-01 as part of the phrase-bank deadlock unit (same owned file). All four
      now run and pass; `npm run test:integration -w @post-anki/api` is 23 files / 92 tests.]
- [ ] A priority review whose suggestions ALL fail node-path resolution still returns 200 with
      an empty list. `.min(1)` does not cover it (the drops happen after parsing) — the panel
      now keeps the "review due" banner up, but shows no error, so it still reads as "nothing
      happened". Deliberately out of scope of the zero-suggestion fix; the review's own
      question 3 proposes surfacing "N returned, M unmatched".

## Manual steps

- [ ] Add the api integration tests to CI. `apps/api` now has `npm run test:all` (fast sweep +
      `test:integration`), but nothing invokes it automatically: `deploy.yml`'s Test job runs
      root `npm test` and has no Postgres service, so folding these into `test` would break the
      pipeline. Patch for the Test job (owned by whoever is editing `.github/workflows` this
      wave — deliberately not touched from the phrase-bank unit):
      add `services: { postgres: { image: postgres:16, env: { POSTGRES_USER: postanki,
      POSTGRES_PASSWORD: postanki, POSTGRES_DB: postanki_e2e }, ports: ["5436:5432"],
      options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s
      --health-retries 5 } }`, then after `npm test`:
      `DATABASE_URL=postgres://postanki:postanki@localhost:5436/postanki_e2e npm run db:migrate
      -w @post-anki/api` and
      `DATABASE_URL=postgres://postanki:postanki@localhost:5436/postanki_e2e npm run
      test:integration -w @post-anki/api`.

- [ ] `pulumi config set --secret electricDatabaseUrl <neon-main-DIRECT-connection-string>`
      (non-pooled — strip `-pooler` from the host) if Electric is to run in production.
- [ ] Set the `PROD_ELECTRIC_ENABLED` repository variable to `true` — only after the above,
      and only once the shape allowlist has been reviewed.
- [ ] `npm run db:migrate:api` against the Neon dev branch to unblock local board rendering.
- [ ] Commit or discard the verification-repo changes left uncommitted by earlier runs
      (`~/work/verification-repo` is outside this session's autonomy grant): the dotenv
      load-order fix in `playwright.post-anki.config.ts` and the memory notes under
      `projects/post-anki/post-anki/docs/memories/`.

## Post-deploy checks

- [ ] Once Electric is live: confirm a `live=true` long-poll (~20s) is not cut short by
      `google-auth-library`/`gaxios`'s default request timeout in production.
- [ ] Once Electric is live: confirm a non-allowlisted table returns 400 through the real
      production URL, not just locally.

## Cross-agent notes (Wave 1)

- [ ] Note for anyone writing a bundle-content check: scanning `apps/web/.output/public/assets`
      for Node built-ins does NOT work — rolldown tree-shakes the offending module out of the
      emitted chunks while the leak is still in the graph (measured 2026-08-01 by reintroducing
      `node:crypto`). Only Vite's resolve-time "externalized for browser compatibility" warning
      survives, which is why `scripts/check-web-node-builtins.mjs` runs the build itself.
- [ ] CI's `test` job now runs a full `apps/web` browser build (`node
      scripts/check-web-node-builtins.mjs`) after `npm test`. If you add a step there, it runs
      before that build, not after.
- [ ] `apps/api/src/shared/merge-lock.ts` gained an additive `withSubjectLock()` export
      (same `hashtext(id)::bigint` advisory-lock space as `withMergeLock`) so curriculum
      creation serializes behind a subject merge. Anyone else touching locking this wave
      should append rather than rewrite that file.
- [ ] Any new DB-backed api test must be named `*.integration.test.ts` OR added by exact path
      to `apps/api/vitest.integration.config.ts`'s `include` — naming it only in
      `vitest.config.ts`'s `exclude` means it runs under no config at all. Four tests were in
      that state until 2026-08-01.
- [ ] Residual, NOT fixed here: `insertDomainNode()` (`apps/api/src/domain-map/`) still
      inserts outside any subject lock, so a domain node created by
      `resolveDomainPlacement`'s sibling-discovery path can still land under a subject that
      a concurrent merge is deleting. Same fix shape as the curriculum one — wrap the insert
      in `withSubjectLock` and re-read the subject inside it. Left for the domain-map owner.
- [ ] Residual, NOT fixed here: `deleteSubject()` (`apps/api/src/subject/subject.repo.ts`) has
      the same orphan window as the merge did — it deletes the subject's curricula in a loop
      and then the subject row, all outside any advisory lock, so a curriculum created between
      those two steps survives its own parent. Deliberately left alone (the wishlist item
      scopes the fix to the merge window); `withSubjectLock` is the ready-made fix if it
      matters.
- [ ] Follow-up e2e scenario needed for the TagPicker live refresh: assert the chip appears
      after assigning a tag WITHOUT the `page.reload()` the existing `assignTagToModule` /
      `createTag` actions currently do (verification-repo is outside this session's grant, so
      the fix was proven with a component test instead). Removing that workaround is also the
      real end-to-end proof.
- [ ] `POST /tags/:tagId/assignments`'s 201 body is now consumed by the web layer (it was
      discarded before). Nothing about the endpoint changed, but it is no longer safe to
      switch it to a 204.

## Wave 1 — in flight

- [x] Close the phrase-bank generate/grade deadlock window and wire its concurrency tests
      into normal verification.
      [→ grading now takes the same `pg_advisory_xact_lock` as generation, before its
      `FOR UPDATE`, via a shared `lockPhraseBankScope()` in `phrase-bank.repo.ts`. Proven
      red-then-green: `phrase-bank-cross-path-deadlock.integration.test.ts` fails with a real
      `deadlock detected` (40P01) without the lock and passes with it. New
      `npm run test:all -w @post-anki/api` = fast sweep + every integration test.]
- [x] Make a zero-suggestion priority review fail loudly instead of silently clearing the
      "review due" banner (plus the missing `domain_priority_suggestions` index).
      [→ `.min(1)` on `domainPriorityReviewAgentResultSchema`, `setDue(false)` gated on a
      non-empty result, migration `0028_massive_ultragirl` applied to the local e2e DB only.
      Proven red-then-green: 2 new orchestrator tests + 3 new panel tests.]
- [x] Close the `createCurriculum`-vs-merge race and the TagPicker live-refresh gap.
      [→ `createCurriculum` now runs under a new `withSubjectLock()` (same advisory-lock space
      as `mergeSubjects`) and re-reads the subject inside it, returning `subject_not_found`
      (404) instead of orphaning a row. `TagPicker` seeds chips from the assign mutation's own
      201 response and reconciles them with route data via `visibleTagChips()`. Both proven
      red-then-green: the race test showed 1 orphan curriculum before the fix, 0 after; the 4
      TagPicker tests all failed against the pre-fix render. The ~25% S1 e2e flake is a
      DIFFERENT root cause — a cold-Vite hydration race, per `LOG.md:410` — not fixed here.]
- [x] Add a build-time guard against Node-only imports leaking into the `apps/web` bundle.
      [→ `scripts/check-web-node-builtins.mjs`, root script `check-web-node-builtins`, wired as a
      step in CI's `test` job. Runs the real `vite build` and fails on Vite's "externalized for
      browser compatibility" warning. Proven by reintroducing `node:crypto` in
      `packages/core/src/subject-duplicate/content-hash.ts` (exit 1, names the module and the
      importing file) and reverting (exit 0).]
