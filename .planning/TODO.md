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

- [ ] **Critical, from the architecture debrief (`docs/architecture/concurrency-and-verification-hardening/review.md`):**
      `deleteSubject` and `withDocScanLock` each hold a pooled connection AND an advisory lock
      while taking a SECOND connection from a `max: 4` pool that has no `connectionTimeoutMillis`
      — so exhausting it hangs forever rather than erroring, and the blocked callers keep holding
      subject locks, which blocks every merge and create on those subjects until a restart.
      Fix is a pattern the repo already has (`DbExecutor`, used in 8 files). A fix agent is on it.

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
- [ ] Mobile `assertSecureUrl` is NOT vulnerable to lookalike hosts (`localhost.evil.com` and
      friends reject — exact Set membership, verified by test 2026-08-01), but two real gaps
      remain: (a) `10.0.2.2` is the Android emulator's host alias, not loopback, so a release
      build on a LAN that has a 10.0.2.2 host would send the bearer token in cleartext;
      (b) the check is a denylist on `http:` only, so any other non-https scheme (`ftp://`,
      `ws://`, anything future) is accepted unchecked. Both are deliberate-looking, so left
      unchanged and untested rather than silently hardened.

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
- [ ] `apps/mobile` now has vitest (`vitest.config.ts` + a `test` script), but `vitest` is
      deliberately NOT declared in its `package.json` devDependencies — declaring it without
      regenerating the root `package-lock.json` breaks CI's `npm ci`, and the lockfile is a
      root file three agents are editing this wave. It resolves from the hoisted root install
      (4.1.7). Whoever next updates the lockfile should add `"vitest": "^2.1.0"` there.
- [ ] `apps/api/src/shared/merge-lock.ts` gained an additive `withSubjectLock()` export
      (same `hashtext(id)::bigint` advisory-lock space as `withMergeLock`) so curriculum
      creation serializes behind a subject merge. Anyone else touching locking this wave
      should append rather than rewrite that file.
- [ ] Any new DB-backed api test must be named `*.integration.test.ts` OR added by exact path
      to `apps/api/vitest.integration.config.ts`'s `include` — naming it only in
      `vitest.config.ts`'s `exclude` means it runs under no config at all. Four tests were in
      that state until 2026-08-01.
- [x] Residual, NOT fixed here: `insertDomainNode()` (`apps/api/src/domain-map/`) still
      inserts outside any subject lock, so a domain node created by
      `resolveDomainPlacement`'s sibling-discovery path can still land under a subject that
      a concurrent merge is deleting. Same fix shape as the curriculum one — wrap the insert
      in `withSubjectLock` and re-read the subject inside it. Left for the domain-map owner.
      [→ done 2026-08-01 in the doc-scan double-click unit. `insertDomainNode()` now runs
      under `withSubjectLock` and returns `DomainNode | { error: "subject_not_found" }`;
      both `resolveDomainPlacement` call sites narrow and fall back to unplaced.]
- [ ] `insertDomainNode()` no longer returns a bare `DomainNode` — any new caller must narrow
      the `{ error: "subject_not_found" }` arm. Same for `resolveDomainTopicSuggestion()` /
      `resolveDomainSupersessionSuggestion()`, which now return
      `{ error: "not_found" | "already_resolved" }` instead of `null`.
- [ ] `PATCH /domain-topic-suggestions/:id` and `PATCH /domain-supersession-suggestions/:id`
      now answer **409 `already_resolved`** when the suggestion is no longer pending (404 stays
      "no such id"). Anyone writing e2e or client code against those two routes should treat a
      409 as "someone already handled this", not as a failure.
- [ ] `apps/api/src/domain-map/doc-scan-lock.ts` is a NON-blocking
      `pg_try_advisory_xact_lock` in the same `hashtext(id)::bigint` space as
      `shared/merge-lock.ts`, kept out of that shared file on purpose. A doc scan that loses
      the lock returns an empty result immediately rather than waiting — the pool is `max: 4`
      and the winner holds its connection across the LLM call, so queued waiters would starve
      it. Keep the tracked-tool fetches OUTSIDE the locked section.
- [x] Residual, NOT fixed here: `resolveDomainTopicSuggestion()`'s accept path inserts its new
      `domain_nodes` row without a subject lock — same orphan window `insertDomainNode()` just
      closed, different call site. Needs a pre-read outside the lock to learn the subjectId
      first, so it was left out of the double-click unit's scope.
      [→ done 2026-08-01 alongside the tracked-tool watermark unit. The suggestion is read once
      outside the lock purely to pick the key, then the subject re-read and the pending claim
      both happen inside `withSubjectLock`. The subject check runs BEFORE the claim so a
      vanished subject leaves the suggestion pending rather than committing it accepted with
      no node behind it. Rejecting deliberately does NOT require the subject to exist.
      New arm: `resolveDomainTopicSuggestion()` can now return
      `{ error: "subject_not_found" }` (type `ResolveDomainTopicSuggestionError`), which
      `PATCH /domain-topic-suggestions/:id` answers as a **404 `subject_not_found`**. The
      supersession resolver is unchanged. Proven red-then-green by
      `topic-suggestion-accept-merge-race.integration.test.ts`: 1 orphan `domain_nodes` row
      under the deleted subject before, 0 after.]
- [x] Known small gap in the review panel's two-tab case: `request()` in
      `apps/web/src/curriculum/api-client.ts` throws `ApiError` on any non-2xx, so a 409
      `already_resolved` lands in the panel's catch and the row stays listed (re-enabled) until
      a page reload. Correct would be to treat 409 like success and drop the row. Not fixed
      because that means editing `api-client.ts`, outside the domain-map unit's ownership.
      [→ done 2026-08-01. `request()` is UNCHANGED — the translation is per-call, mirroring
      `submitStructureTurn`/`resolveSupplementalResearch`'s existing 409 guard-code handling in
      the same file. Proven red-then-green in `curriculum/api-client.test.ts`.]
- [ ] `resolveDomainTopicSuggestion()` / `resolveDomainSupersessionSuggestion()` in
      `apps/web/src/curriculum/api-client.ts` no longer return the suggestion directly — they
      return `ResolveDocScanSuggestionResult<T>` = `{ outcome: 'resolved'; suggestion: T } |
      { outcome: 'already_resolved' }`, and the two `domain-map.api.ts` server fns pass that
      shape through. A 409 whose code is exactly `already_resolved` becomes the second arm;
      every other non-2xx (404, 500, a different 409 code, a network failure) still throws
      `ApiError`. Deliberately a serializable object, not a typed exception: these values cross
      the TanStack server-fn RPC boundary, where an `Error` subclass loses its class identity
      and a client-side `instanceof` would silently never match.
- [ ] Residual for the subject-module owner, found while closing the topic-suggestion lock:
      `mergeSubjects()` reassigns `curricula` and `domain_nodes` but touches NEITHER
      `domain_topic_suggestions` NOR `domain_supersession_suggestions`, so the source subject's
      pending doc-scan suggestions outlive the subject. Since 2026-08-01 accepting one is
      cleanly refused (`subject_not_found`, no orphan node) instead of creating a node under a
      dead subject — strictly better — but those rows are now stuck pending forever and
      invisible, because the review panel lists suggestions by `subjectId` and that id is the
      deleted source. Fix is reassigning both tables to the target inside `mergeSubjects`
      (`apps/api/src/subject/subject.repo.ts`), which the domain-map unit does not own.
- [ ] Residual, deliberately NOT guarded: `resolvePrioritySuggestion()` still acts without a
      `WHERE status = 'pending'` claim. Unlike the two doc-scan resolvers it is idempotent
      (a second accept re-writes the same target depth, no second row), so it was left alone;
      its buttons DO get the new per-item in-flight disable.
- [x] Residual, NOT fixed here: `deleteSubject()` (`apps/api/src/subject/subject.repo.ts`) has
      the same orphan window as the merge did — it deletes the subject's curricula in a loop
      and then the subject row, all outside any advisory lock, so a curriculum created between
      those two steps survives its own parent. Deliberately left alone (the wishlist item
      scopes the fix to the merge window); `withSubjectLock` is the ready-made fix if it
      matters.
      [→ done 2026-08-01. `deleteSubject()` now runs under `withSubjectLock` and re-reads the
      subject inside it; its old inner `db.transaction` IS that lock transaction now, not a
      second one nested in it. Proven red-then-green by
      `subject/subject-delete-merge-race.integration.test.ts`: deleting the merge TARGET left
      1 orphan curriculum before the fix (0 after), and deleting the merge SOURCE destroyed
      the curriculum the merge was handing over and still returned `true` before the fix
      (returns `false`, curriculum preserved under the target, after).]
- [ ] `deleteSubject()` now holds one pooled connection (its lock transaction) for its whole
      run while each `deleteCurriculum()` inside the loop takes a SECOND connection, because
      `deleteCurriculum`/`clearCurriculumStructure` are not transaction-aware and live in
      `apps/api/src/curriculum/`, which the subject unit does not own. With `max: 4` on the
      pool, four concurrent subject deletions would each hold a connection and then all need a
      fifth — they would starve rather than deadlock the DB, but they would hang. Also means
      the curricula and the subject row are still two separate commits (as before the lock
      fix), so a crash mid-delete leaves an empty subject; the window is now longer. Real fix
      is making `deleteCurriculum` accept a `Tx`.
- [x] `clearCurriculumStructure` is now provenance-aware and takes a second `scope` argument
      (`"own"` by default, `"all"` only from `deleteCurriculum`). Modules AND topics carry a
      nullable `merged_from_curriculum_id` (migration `0029_lucky_maestro`, applied to the local
      e2e DB only — Neon dev/prod still need it). Anyone adding a new caller of
      `clearCurriculumStructure` must decide which scope they mean: `"own"` spares merged-in
      rows, `"all"` is required whenever the curriculum row itself is going away, or the rows
      orphan. `saveCurriculumPlan`'s `orderOffset` is no longer safe to pass as 0 after a clear —
      `parseCurriculum`/`confirmStructure` now pass `maxModuleOrder(curriculumId)`.
- [ ] Residual, NOT fixed by the `clearCurriculumStructure` provenance unit:
      `mergeSourcesIntoCurriculum`'s SUCCESS path still destroys merged-in modules. It runs
      `deleteModules(freeModuleIds)` and rebuilds from the fresh plan; a merged-in module with no
      learning progress is "free", so it is deleted outright — same total-loss class as the bug
      just fixed, different trigger, reachable from the same "add more sources" flow. Not fixed
      because excluding merged-in modules from `freeModuleIds` would make them permanently
      unrebuildable by any later merge-sources run — a product decision, not a column.
- [ ] Residual, NOT fixed by the `clearCurriculumStructure` provenance unit: `retryResearch()`
      still calls `deleteAllCurriculumSources(curriculumId)`, which deletes merged-in `sources`
      rows along with the curriculum's own. Deliberately left alone — `resolveRetryResearchSource`
      picks the re-research URL from those same source rows, so preserving another curriculum's
      sources would risk pointing A's retry at B's docs. Needs a product decision, not a column.
- [ ] Follow-up e2e scenario needed for the TagPicker live refresh: assert the chip appears
      after assigning a tag WITHOUT the `page.reload()` the existing `assignTagToModule` /
      `createTag` actions currently do (verification-repo is outside this session's grant, so
      the fix was proven with a component test instead). Removing that workaround is also the
      real end-to-end proof.
- [ ] `POST /tags/:tagId/assignments`'s 201 body is now consumed by the web layer (it was
      discarded before). Nothing about the endpoint changed, but it is no longer safe to
      switch it to a 204.
- [x] `tracked_tool_scan_state` is now keyed by `(subject_id, tool_key)` (migration
      `0030_groovy_madame_web`, hand-ordered — drizzle-kit emitted the ADD CONSTRAINT before
      the ADD COLUMN and left the old PK's DROP commented out). `getTrackedToolScanState()` /
      `upsertTrackedToolScanState()` both take `subjectId` first now. Applied to the local
      e2e DB only; Neon dev/prod still need it. Existing rows are attributed to the sole
      gated subject only when exactly one exists, and dropped otherwise — on the local e2e DB
      (20 leftover gated subjects) that meant its 4 rows were dropped, which just costs one
      redundant scan.
- [ ] `apps/api/src/domain-map/doc-scan-lock.ts` stays a single GLOBAL advisory key even
      though the watermark is now per-subject and a per-subject key would serialize the right
      thing. Reason: a scan holds two pooled connections across an LLM call and
      `db/client.ts` is `max: 4`, so per-subject keys would let two scans exhaust the pool.
      Consequence to know about: a manual "Scan now" for subject B while the scheduler is
      mid-run on subject A still returns an empty result. The scheduled run is sequential, so
      every subject still gets its own scan.

## Wave 1 — in flight

- [x] Close the doc-scan review screen's double-click duplicate-node bug and two related
      hardening gaps.
      [→ `resolveDomainTopicSuggestion()` / `resolveDomainSupersessionSuggestion()` now CLAIM
      the row with `UPDATE ... WHERE status = 'pending' RETURNING *` before acting, so a
      second accept is a 409 `already_resolved` instead of a second real `domain_nodes` row.
      Per-item accept/reject buttons got a ref-backed in-flight guard
      (`use-resolving-suggestions.ts`). The scan's watermark read-compare-write plus its one
      agent call now run under a non-blocking `doc-scan-lock.ts`, with the tracked-tool
      fetches hoisted out of it. `insertDomainNode()` runs under `withSubjectLock`.
      `infra/index.ts` uses `config.requireSecret("apiSharedSecret")`. Proven red-then-green:
      6 new repo tests in `suggestion-double-resolve.integration.test.ts` (all 6 red before,
      all 6 green after), the new concurrent-scan test in `doc-scan.orchestrator.test.ts`
      (2 agent calls before, 1 after), and 2 of 3 new panel tests (double-click sent 2
      requests before, 1 after).]
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
- [ ] Measured 2026-08-01 (Playwright, e2e stack under `vite dev`): on an 8-module/80-topic
      curriculum the "+ tag" button is in the DOM at ~130ms and hit-testable (the click event
      reaches document capture phase, `elementFromPoint` returns the button — no overlay), but
      React only attaches its handler (`__reactProps$` expando) at ~290ms for a y=5011px button
      and ~500-970ms for a y=44769px one. `window.__TSR_ROUTER__` — all `waitForHydration`
      checks — resolves at ~210ms, so there is a 70-370ms window where any control below the
      fold is visible, enabled-looking and completely dead. React 19 root hydration here is
      time-sliced and progressive (no Suspense boundaries on this page), so this affects EVERY
      far-down control, not just TagPicker.
- [ ] Human-gated (verification-repo is outside this session's grant): the 3-attempt click-retry
      loop in `projects/post-anki/post-anki/features/tag/actions/assign-tag.action.ts` can now be
      collapsed back to a single `await openButton.click()` and the curriculum-merge S1 test
      re-run to confirm. TagPicker's "+ tag" / remove controls now render `disabled` until the
      component has actually hydrated, and Playwright's `click()` auto-waits for enabled — so the
      wait the retry loop was faking is now a real actionability signal. Measured 15/15 first-click
      opens on a y=44769px button that failed 0/5 before the change.
