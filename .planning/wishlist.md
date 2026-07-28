# Post Anki wishlist

Priority order — top is highest priority. `/grand-loop` picks the first `- [ ]` item.

## Active build queue (2026-07-28) — plan-playwright → write-playwright-tests → review-playwright per item

Reordered from a longer business-value review: two known bugs moved to the front because the
next two features attach to the exact surfaces they break; the two items with a concrete
existing source (already-verified code in the source app) come next since their Definition of
Done is unambiguous; then the knowledge-map cluster in dependency order; the item needing
external data-source/credential decisions (#53) is deliberately last, since `/grand-loop` halts
on a human-only blocker rather than skipping past it.

- [x] Fix batch-practice's no-fallback dependency on Electric sync for reading a freshly
      generated phrase batch.
      [→ done: .bmad/batch-practice-electric-fallback/, merged to main 2026-07-28 (commit
      55aabd7). review-playwright verdict: PASS 8/8 (S1-S8, fresh servers spawned from the
      main-tree checkout). A real regression the fix itself introduced (a stale reset-effect
      re-firing on the same level/pack and permanently stalling the retry guard) was caught by a
      full-suite re-run during implementation and fixed with an idempotency guard — see
      use-practice-batch.ts's lastResetKeyRef.]
      Why: `POST /subjects/:id/phrase-batches` already returns the full phrase rows in its
      response, but `apps/web/src/practice/use-practice-batch.ts` discards everything except
      `batchId` and waits exclusively for Electric to redeliver the same rows before rendering
      anything. If Electric is unconfigured, slow, or has any outage, the page gets stuck on
      "Generating your next batch of phrases…" forever with no error — this will hit real users
      the moment this feature ships, since `ELECTRIC_SERVICE_URL` reaching Neon is still an
      unfinished manual step (see `.planning/local-first-electric-sync/todo.md`). The board
      feature already solved this exact problem with an SSR fallback; batch-practice doesn't
      follow that established pattern. Moved to the front of this queue because "check my
      writing" and "workplace scenario packs" below attach to this same read surface — e2e-proving
      them against a documented hang would prove nothing.
      Pointers: full writeup + proposed fix in `docs/architecture/english-batch-practice/review.md`
      (found during `/debrief` 2026-07-25) — seed the UI directly from the generate response,
      treat Electric as a live-update layer on top instead of the only read path.
      Done when: opening `/practice/:subjectId` and generating a batch renders phrases
      immediately from the mutation response, with Electric sync verified independently as an
      enhancement (e.g. a second tab/device sees the same batch) rather than a hard dependency.
- [x] Close the phrase-bank's concurrency and data-integrity gaps: no real FK, no locking.
      [→ done: .planning/phrase-bank-concurrency-fix/, merged to main 2026-07-28. review-playwright
      verdict: PASS — 15/15 backend integration tests proving all 3 races closed + the FK, 1/1 e2e
      regression. A real bug was found and fixed along the way: the app-level uniqueness check on
      phrase text excludes mastered entries, so the first DB-level unique index draft would have
      500'd on a mastered phrase being reintroduced — fixed with a partial index
      (`WHERE status <> 'mastered'`), caught by the plan's own integration test before it shipped.]
      Why: `docs/architecture/phrase-bank-mastery/review.md` (found during `/debrief` 2026-07-25)
      found the design doc's own claim that `phrases.targetPhraseBankEntryId` is "a real FK" is
      false in the actual migration — it's a plain nullable text column, no `REFERENCES` clause.
      The app-level id validation makes this safe for the one path that writes it today, but
      nothing stops a future write path from creating a dangling reference, and — worse — three
      real races (unlocked `MAX(sequenceNumber)` read in `nextSequenceBase`, unlocked
      read-then-insert in `linkOrCreateTargetPhrases`, an unconditional `UPDATE` with no
      optimistic-concurrency check in `updatePhraseBankEntryAfterAttempt`) degrade into silent
      data corruption instead of a loud DB error specifically because there's no constraint to
      catch them. Moved ahead of "Generalize the phrase-bank mastery state machine" below because
      that item explicitly widens this exact write path to every subject — fix the races before
      multiplying the traffic through them.
      Pointers: `docs/architecture/phrase-bank-mastery/review.md`'s "Proposed alternative" — a
      real FK, two unique indexes, and wrapping the two write paths in
      `pg_advisory_xact_lock`/`SELECT ... FOR UPDATE` respectively. All additive migrations, no
      API shape change.
      Done when: two concurrent generate calls (or two concurrent grade calls) for the same
      subject/level/pack, exercised by a real test, can no longer produce overlapping sequence
      numbers, duplicate bank entries for the same phrase, or a lost mastery transition — either
      one serializes behind the other, or the second gets a clean, catchable error.
- [x] Port "check my writing" freeform scoring to the English subject.
      [→ done: .planning/check-my-writing-mode/, merged to main 2026-07-28. review-playwright
      verdict: PASS 3/3 + regression check green (12/12 total, no fallout on the two
      previously-merged items in this run). Build phase found and fixed two real bugs: a
      non-waiting existence check racing the page load, and a network-response matcher looking for
      a literal REST path that TanStack Start server functions never expose (real requests go to
      `/_serverFn/<base64>`) — built a small decoder helper to fix it properly rather than loosen
      the assertion.]
      Why: turns English practice into a daily-use utility for real work writing, not just
      scheduled drills — already built and verified in the source app this session.
      Pointers: source repo `.bmad/check-my-writing-mode/`. No plan yet.
      Done when: pasting free text gets a native-soundingness score + rewrites, saved to a history
      list, same as the source app.
- [x] Port workplace scenario packs to the English subject.
      [→ done: .planning/workplace-scenario-packs/, merged to main 2026-07-28. Turned out to be a
      verification-gap fix, not a build: the pack picker UI/data model/agent theming were already
      fully built as a side effect of the batch-practice and phrase-bank-mastery ports, but nothing
      proved pack selection actually changed generated content (the e2e mock LLM ignored the pack
      parameter). Made the mock pack-aware + added 3 e2e scenarios. review-playwright verdict: PASS
      12/12 (3 new + 9 regression, no fallout).]
      Why: themed content packs (standup updates, code review, incident postmortems, giving
      feedback) already exist and were verified working in the source app this session.
      Pointers: source repo `.bmad/workplace-scenario-packs/`, `.planning/LOG.md` entry for
      2026-07-18. No plan yet.
      Done when: a pack picker themes generated batches the same way it does in the source app.
- [x] Seed subjects and courses/topics — incremental domain/technology intake, grown over time
      rather than fixed at creation.
      [→ done: .planning/seed-knowledge-map/, merged to main 2026-07-28. review-playwright verdict:
      PASS 21/21 (6 new + 15 regression). New self-referential `domain_nodes` tree per subject,
      deliberately kept separate from the earlier-shipped `tags`/`tag_assignments` mechanism (a
      different concept — many-to-many cross-cutting labels vs. a strict one-parent tree). A real,
      non-mocked live call against the sibling-discovery agent confirmed it correctly placed "Astro"
      under "Meta-frameworks" alongside genuinely accurate real-world siblings (Next.js, Remix,
      Nuxt.js, SvelteKit, Qwik, Gatsby, Eleventy, Angular Universal, SolidStart) — the AI placement
      mechanism works for real, not just against the e2e mock.]
      Why: today a Curriculum is created once, from a single name or docs URL (see the shipped
      `.planning/doc-link-technology-intake/`). This is a different, complementary idea: let broad
      Subjects/domains be pre-seeded with a starter shape, then grown incrementally as the user
      actually learns — start as broad as "AI", discover its subdomains, and keep attaching more
      context and sources to specific branches over time instead of only at intake time.
      Pre-seed some initial domains, one of which is "programming" — informed by the user's real
      Anki deck/subdeck structure (429 decks, top-level domains like "Web dev" with deep subtrees
      for meta-frameworks/cloud services/databases/etc., "POLISH", "Business", "INVESTING",
      "Music") as a real example of how a growing body of knowledge naturally organizes.
      Pointers: `apps/api/src/db/schema.ts` (`subjects`, `curricula` tables — current two-tier
      model), `.planning/doc-link-technology-intake/` (the adjacent, already-shipped single-shot
      intake this complements, not replaces).
      Done when: at least one pre-seeded domain (programming) exists with a sensible starter
      hierarchy, and a user can attach new context/sources to an existing branch without
      recreating it from scratch.
      Needs real product/architecture planning first (how domains relate to the existing
      Subject/Curriculum model, what "incremental attachment" means concretely) — this entry
      queues the idea, it does not spec it. (#48)
- [x] Manage the ontology over time — split or merge subjects/courses/tags (merge only, split
      deferred as a fast-follow — see below).
      [→ done: .planning/ontology-split-merge/, merged to main 2026-07-28. review-playwright
      verdict: sound — zero-orphan merge proof passed on every real execution (subjects, curricula,
      domain_nodes, tags), 21/21 regression across all five previously-merged items in this run.
      One flaky e2e run (S1, ~25%) traced to a pre-existing tag-picker hydration timing race
      unrelated to the merge logic itself — the zero-orphan proof never failed, only a setup click
      occasionally didn't register. Fixes the real "Webdev" vs "Programming / Web Development"
      duplicate named in the issue.]
      Why: the seeded taxonomy (#48) is a starting point, not a fixed shape — a Subject/course
      will turn out too coarse or too fine as the user actually studies, and there's currently no
      way to reshape it except hand-editing the database. Real example needing this today:
      production has both a pre-existing "Webdev" subject and the newly-seeded "Programming / Web
      Development" subject sitting as near-duplicates.
      Pointers: #48, `apps/api/scripts/seed-subjects.ts`.
      Done when: a Subject, course, or tag can be split into multiple or merged into one from the
      app, with existing children/assignments correctly reassigned, not orphaned or duplicated.
      Needs real product/architecture planning first — this entry queues the idea, it does not
      spec it. (#56)
- [x] Per-domain expertise priority, with a manual review trigger (not yet monthly-automatic —
      see note below).
      [→ done: .planning/domain-priority-review/, merged to main 2026-07-28. review-playwright
      verdict: PASS 5/5 + 24/24 regression across all six previously-merged items in this run.
      Scoped deliberately: #49 (doc/changelog scan) and #53 (job market scan) — the intended
      trend-signal inputs — aren't built yet, so this pass uses one general-purpose AI call
      (labeled `source: "general-knowledge"`) instead of real trend data, with the review
      mechanism (accept/reject, 30-day-due indicator) designed so #49/#53 can plug in their own
      suggestion sources later with zero redesign. One accepted residual gap: the review-due
      indicator relies on the agent prompt always returning ≥1 suggestion, not a code-level floor
      — if a real model call ever returns zero suggestions, the indicator would stay stuck "due."]
      Why: not every domain in the knowledge map (#48) deserves the same depth. Lower priority is
      fine for areas that just need familiarity; some areas (AWS, Next.js, Postgres/databases)
      need real expert-level depth and will take sustained effort to close the gap. The map needs
      a target depth per domain, separate from the current knowledge percentage — the gap between
      the two is what should drive study focus.
      A monthly review re-examines priorities since what matters shifts as technology changes —
      the agent can suggest re-prioritization based on trend/news signal (see #49 and the
      job-market/community trend scan below) instead of the user having to notice drift.
      Pointers: #48 (the knowledge map this adds a priority dimension to), #49 (one input to the
      review).
      Done when: at least one domain has an assigned target expertise level distinct from its
      current knowledge percentage, and a monthly review surfaces at least one suggested
      re-prioritization for the user to accept or reject.
      Needs real product/architecture planning first — this entry queues the idea, it does not
      spec it. (#52)
- [x] Add an Opinion-First Decision Training mode (`/decide`) — user reasons through a real
      architectural decision before seeing any AI evaluation.
      [→ done: .planning/decide-mode/, merged to main 2026-07-28. review-playwright verdict:
      PASS 4/4 + 29/29 regression across all seven previously-merged items in this run. Real
      discovery during planning: a `/decide` page/agent/controller already existed from the
      project's first commit and already got the opinion-first sequencing right — this item added
      persistence (decide_sessions/decide_blind_spots) and an accept/reject step for blind spots
      (mirroring domain_priority_suggestions, `source: "decide"` as the seam for #57), leaving
      decide.agent.ts's instructions completely untouched (confirmed: empty diff). Also fixed a
      real shared bug in every TanStack-Start-server-fn-driving e2e action in this project: the
      response-matching helper only handled standard base64, not the base64URL encoding TanStack
      Start actually uses — silently corrupting the decode and causing timeouts even after a
      correct 200 had already arrived.]
      Why: every other interaction in this app either asks the user a Socratic question that
      leads them toward an answer, or grades an answer against a rubric — nothing captures the
      user's own independent reasoning on a real decision before the AI weighs in. The original
      PRD's [Epic] Opinion-First Decision Training (issue #10) names this as its own load-bearing
      capability: "user describes a real architectural decision, reasons through it before seeing
      any AI evaluation, then receives gap analysis on their reasoning... Prevents the AI relay
      failure mode where the user stops forming independent judgment." Nothing shipped today does
      this — the closest existing surface (probe/study-chat) always leads with an AI question,
      never waits for the user's own unprompted stance first.
      Pointers: `apps/api/src/mastra/mentor.agent.ts` (existing Socratic-question pattern to
      diverge from, not reuse directly — this mode must not lead with an AI question),
      `apps/api/src/practice/` (closest existing "user answer → graded response" wiring shape,
      for reference on request/response contract only), issue #10 (original epic body has the
      fuller UX narrative).
      Done when: a user can describe a real decision they're facing, submit their own reasoning
      first, and only then receive a structured gap analysis of that reasoning — with any gap it
      finds tracked wherever the generalized gap-tracking mechanism (#57) lands.
      Needs real product/architecture planning first — which subject/entity this attaches to (a
      new subject kind, or a standalone mode independent of subjects), how "gap analysis of
      reasoning" is scored/structured, whether this needs its own persistence model. This entry
      queues the idea, it does not spec it. (#59)
- [x] Generalize the phrase-bank mastery state machine to drive gap tracking for every subject
      kind, not just language-practice.
      [→ done: .planning/generalize-gap-tracking/, merged to main 2026-07-28. review-playwright
      verdict: sound, no data-integrity gap found — 9/9 e2e + 25/25 integration tests (concurrency
      proof verified by temporarily removing the advisory lock and confirming a real Postgres
      duplicate-key failure before restoring it) + 44/45 regression (the one failure reproduced
      identically against the unmodified parent commit, confirmed pre-existing tag-picker
      flakiness, not caused by this change). Deliberately did NOT unify with domain_priority_
      suggestions or decide_blind_spots — read the actual schema comments and found my own
      original framing was wrong (domain_priority_suggestions' seed is #49/#53, not this item);
      only decide_blind_spots names this as its seam, and even that doesn't structurally fit
      (a one-off reasoning blind spot has no re-askable question to recycle). Instead widens
      specifically the pre-existing gaps table's binary "covered" flip (which could resolve on one
      lucky guess) with a gap_mastery sidecar table, mirroring phrase-bank-concurrency-fix's own
      locking discipline exactly. Found and fixed a real display bug along the way:
      curriculum.repo.ts had its own duplicated gap-hydration path bypassing gap.repo.ts entirely.]
      Why: `packages/core/src/phrase-bank/phrase-bank.ts` (`selectDuePhrases`,
      `applyAttemptToPhraseBankEntry`, `matchExistingPhraseBankEntry`) is a real, already-built
      and heavily-tested pure deriver implementing exactly the "gap recycled into future
      practice, archived after 3 non-adjacent correct answers" behavior that the original PRD's
      [Epic] Gap Tracking Foundation (issue #7) and [Story] Gap resolved when consistently
      demonstrated (issue #44) describe wanting to build from scratch. Applying it
      architecture-mentor-wide means a missed probe/quiz question on any subject becomes a
      tracked, recycled gap and eventually a "you've demonstrated this — resolved" moment, reusing
      a mastery rule already proven correct for English instead of designing and building a second
      parallel gap-tracking system.
      Also folds in two adjacent old-PRD ideas rather than filing them separately, since both
      presuppose this substrate: [Story] Same gap across tools triggers a cross-cutting nudge
      (#30, plus its stats-view counterpart #39) — once gaps are tracked across subjects, the same
      concept recurring in 3+ subjects should surface as a nudge; and [Story] Gap resolved when
      consistently demonstrated (#44) — already covered by the mastery-archival behavior itself.
      Pointers: `packages/core/src/phrase-bank/phrase-bank.ts` (the pure derivers — generalize
      away the "phrase" framing to a generic "practice item"), `apps/api/src/practice/
      phrase-bank.repo.ts` and `generate-phrase-batch.orchestrator.ts` /
      `grade-attempts.orchestrator.ts` (the wiring pattern to mirror for probe/quiz),
      `docs/architecture/phrase-bank-mastery/review.md` (concurrency gaps — must be fixed by the
      "Close the phrase-bank's concurrency and data-integrity gaps" item above before this ships).
      Done when: a missed probe/quiz question on a non-English subject is tracked as a gap,
      resurfaces in a later session while still weak, and gets archived as resolved after 3
      non-adjacent correct demonstrations — visible in the UI, not just the database.
      Needs real product/architecture planning first — how a "gap" on an architecture-mentor
      subject maps to something recyclable across probe questions and study-chat sessions, since
      probe questions aren't a fixed bank the way phrase drills are. This entry queues the idea,
      it does not spec it. (#57)
- [x] Periodic doc/changelog scan — surface new topics and adjust knowledge-map percentages
      over time, without overwhelming the user.
      [→ done: .planning/doc-changelog-scan/, merged to main 2026-07-28. review-playwright
      verdict: PASS 5/5 + 41/42 regression (one confirmed timing flake under sustained load,
      re-ran clean). Content-hash change detection means zero AI calls and zero new suggestions
      when a tracked tool's docs haven't moved — proven by an explicit call-count assertion, not
      "no new rows." Flags rather than reduces knowledge percentage (the percentage is derived,
      nothing can write to it directly, and an automatic drop would violate the app's
      no-passive-decay principle). Includes a real Pulumi Cloud Scheduler job — deploy correctly
      deferred to a human (no prod deploy credentials in this session, and none would run
      unattended regardless); manual steps in .planning/doc-changelog-scan/todo.md. One real,
      clearly-documented limitation for a human to decide on: `tracked_tool_scan_state` is keyed
      by tool_key alone, so only the first of multiple gated subjects gets real suggestions per
      scheduled run — invisible today (one gated subject exists), becomes a correctness bug the
      moment a second is seeded.]
      Why: the global knowledge map from "Seed subjects and courses/topics" (#48) needs to stay
      current, not just reflect a one-time snapshot. Periodically scan the docs/changelogs of
      tools the user actually tracks (e.g. Next.js docs, Remix docs, TC39/ECMAScript proposals)
      to (1) suggest new topics that appeared, and (2) reduce/flag a node's knowledge percentage
      when new material supersedes or extends what was previously known.
      Explicit constraint from the user: this must not overwhelm — rate-limited/digest cadence
      (daily or weekly, not per-change), not a firehose of every commit or minor patch note.
      Related: the existing [Epic] Weekly Ecosystem Digest (#11) under [Initiative] Ecosystem
      Awareness already covers a similar "GA-only, 3-5 tools, anti-noise" digest for the older
      Telegram-mentor roadmap (`.planning/initiatives/04-ecosystem-awareness.md`) — this item is
      the same underlying mechanism, wired into the knowledge-map/percentage model from #48
      instead.
      Pointers: `.planning/initiatives/04-ecosystem-awareness.md`, issue #11, issue #48.
      Done when: at least one tracked tool gets scanned on a schedule, a genuinely new
      topic/concept surfaces as a suggestion, and an existing knowledge-map node's percentage
      visibly drops when the scan finds something that supersedes it — all without generating
      more than a small, bounded number of notifications per cycle.
      Needs real product/architecture planning first (scan source/frequency, how "supersedes"
      is judged, notification channel) — this entry queues the idea, it does not spec it. (#49)
- [ ] Job market + community trend scanning, grouped by country.
      Why: priority (#52) shouldn't be based on personal interest alone — regularly scan job
      market demand by technology, grouped by country (US, Europe, Russia, Belarus, Poland),
      surfacing what's gaining traction worldwide, plus lightweight Reddit/X monitoring as a
      cross-check for real trend signal (not just "a nerd programmer said it's important").
      Explicit constraint from the user: the social-monitoring piece should stay light-touch, a
      cross-check not the primary driver — not meant to be an aggressive social-listening
      pipeline. Deliberately placed last in this queue: no data source/API/credential has been
      chosen for job-market data, so this is likely to hit a genuine human-only blocker during
      planning — every item ahead of it should get built first.
      Pointers: #52 (the review this feeds into), #48 (the knowledge map the recommendations
      apply to).
      Done when: at least one scan produces country-grouped demand data plus a small set of
      recommendations without excessive noise, and a Reddit/X cross-check is demonstrated as
      lightweight supplementary signal, not a primary driver.
      Needs real product/architecture planning first — this entry queues the idea, it does not
      spec it. (#53)

- [ ] Close a real deadlock window between the phrase-bank's two new locks, and wire its
      concurrency tests into the normal test run.
      Why: `docs/architecture/phrase-bank-concurrency-fix/review.md` (found during `/debrief`
      2026-07-28) found that the plan's own self-grill incorrectly concluded the generation path's
      `pg_advisory_xact_lock` and the grading path's `SELECT ... FOR UPDATE` can never conflict —
      they can, because the FK added by that same fix makes `insertPhraseBatch` take an automatic
      `FOR KEY SHARE` lock on the referenced `phrase_bank_entries` row, which conflicts with
      `FOR UPDATE`. A generate and a grade concurrently touching the same recycled entries in
      different lock orders can deadlock — Postgres aborts one side cleanly (a 500, not corrupted
      data), so this isn't data-loss-critical, but it's a real, avoidable failure mode. Separately,
      the 15 integration tests that prove the concurrency fix works aren't wired into
      `npm run test` or CI — they ran once at build time and currently pass, but nothing re-runs
      them if a future change reintroduces one of the races they were written to catch.
      Pointers: `docs/architecture/phrase-bank-concurrency-fix/review.md`'s first reviewer
      question has the concrete one-line mitigation — have grading take the same advisory lock
      before its `FOR UPDATE`, matching generation's lock order. `apps/api/vitest.config.ts`
      (where the two integration test files are currently excluded from the default run).
      Done when: a deliberately constructed concurrent generate+grade against the same recycled
      entry no longer deadlocks (proven by a new test exercising that exact interleaving), and
      `npm run test -w @post-anki/api` (or an explicit CI step) runs the two integration test
      files as part of normal verification, not just at build time.
- [ ] Add split (subject/course/tag) as the fast-follow to the merge-only ontology management
      shipped in `ontology-split-merge`.
      Why: `.planning/ontology-split-merge/discussion.md` deliberately scoped that item to merge
      only — split requires a real judgment call about which children (curricula, domain_nodes,
      tag assignments) go to which new piece, genuinely harder and riskier than a strict
      reassignment. Splitting also means domain_nodes gets a re-parenting path for the first
      time, which is exactly when the tree-assembly recursion's missing cycle guard (flagged in
      `docs/architecture/seed-knowledge-map/review.md`) stops being unreachable — this item must
      add that guard as part of its own scope, not assume it's already there.
      Pointers: `apps/api/src/subject/subject.repo.ts` (`mergeSubjects`, the reassignment pattern
      to mirror in reverse), `apps/api/src/domain-map/domain-map.repo.ts` (the tree-assembly
      recursion needing a cycle guard before this ships).
      Done when: a Subject, course, or tag can be split into multiple from the app, with existing
      children correctly assigned to the right piece (not orphaned or duplicated), and a
      deliberately-malformed re-parenting attempt is rejected rather than causing an infinite loop.
      Needs real product/architecture planning first — how the split UI decides which children go
      where (manual assignment vs. a suggested split). This entry queues the idea, it does not
      spec it.
- [ ] Close the `createCurriculum`-vs-merge race and harden the TagPicker's live-refresh gap.
      Why: two real, non-blocking gaps found during `ontology-split-merge`'s build and review,
      both deliberately deferred rather than fixed inline: (1) `resolveDomainPlacement`/
      `createCurriculum` run as separate, un-transacted, unlocked statements, so a curriculum or
      domain node could still land under a source subject in the narrow window between a merge's
      reassignment and its delete — mirrors the same class of gap `phrase-bank-concurrency-fix`
      shipped its primary fix for while logging a residual race separately; (2) `TagPicker`
      doesn't reliably reflect a live tag assignment in the SPA without a full reload (direct
      API/DB reads confirm the write succeeds; the display doesn't refresh) — real, pre-existing,
      unrelated to the merge feature itself, worked around in e2e test actions rather than fixed.
      This second gap also caused one ~25% e2e flake (`review-playwright` on `ontology-split-merge`,
      2026-07-28) in a *different* place — a setup click on the tag-picker control occasionally not
      registering — worth confirming whether it's the same root cause before fixing both at once.
      Pointers: `apps/api/src/subject/subject.repo.ts` (`mergeSubjects`, `createCurriculum` in
      `apps/api/src/curriculum/`), `apps/web/src/curriculum/` (`TagPicker` component,
      `router.invalidate()` usage vs. seeding from a mutation response — the same fix shape already
      used for the Electric-fallback and seed-knowledge-map races).
      Done when: a curriculum created during the exact window of a concurrent subject merge either
      serializes behind it or gets a clean error, never landing under a deleted subject; and
      assigning a tag updates the visible chip immediately, without a page reload, proven by an
      e2e test that does NOT navigate away before asserting.

- [ ] Make a zero-suggestion priority review fail loudly instead of silently clearing the
      "review due" banner.
      Why: `docs/architecture/domain-priority-review/review.md` (found during `/debrief`
      2026-07-28) found the trigger handler unconditionally clears the "review due" indicator on
      any successful review call, including one that returns zero suggestions. The agent's prompt
      asks for at least one suggestion but nothing enforces it in code, so a real model call that
      returns an empty list looks — to the user, within the same session — exactly like "the
      reminder mechanism silently did nothing," not an error. Not critical (rare, non-blocking,
      no data loss) but a cheap, well-specified fix.
      Pointers: `apps/api/src/mastra/domain-priority-review.agent.ts` (add `.min(1)` to the
      result schema so an empty response fails structured-output validation and takes the
      already-correct 502 error path instead of silently succeeding),
      `apps/web/src/domain-map/priority-review-panel.tsx` (stop predicting `due: false` on an
      empty successful result). Also worth doing in the same pass: an index on
      `domain_priority_suggestions(subject_id, created_at)` — currently unindexed, a growing scan
      per subject over time, flagged non-urgent in the same review.
      Done when: a mocked zero-suggestion agent response results in a visible error (matching the
      existing 502 path), not a silently-cleared "review due" banner.
- [ ] Ensure the two disk-only Playwright memory notes captured during this run's build/review
      passes (missing `.env` file, `routeTree.gen.ts` regeneration, `npm run <script> -w
      <workspace>` vs `npx <tool> -w <workspace>` gotchas; verification-repo's cross-project
      `PROJECT_DEV_SERVER_URL` env-precedence bug) are actually picked up by future sessions.
      Why: several build/review agents in this run wrote gotchas to
      `verification-repo/projects/post-anki/post-anki/docs/memories/` or fixed shared config
      directly, but that repo is outside this session's autonomy grant (`~/work/`), so those
      fixes and notes were left uncommitted for manual review — worth a deliberate pass to
      confirm they're actually committed and indexed rather than silently lost.
      Pointers: `verification-repo/playwright.post-anki.config.ts` (the dotenv load-order fix
      from `phrase-bank-concurrency-fix`), `verification-repo/projects/post-anki/post-anki/docs/
      memories/` (gotcha notes from `ontology-split-merge`'s build agent).
      Done when: both the config fix and the memory notes are committed in verification-repo, or
      a human has explicitly decided not to keep them.

- [ ] Clean up orphaned `gap_mastery` rows left behind by gap/topic/module/curriculum deletion.
      Why: `docs/architecture/generalize-gap-tracking/review.md` (found during `/debrief`
      2026-07-28) found `gap_mastery` has no FK/cascade to `gaps`, and none of the four existing
      deletion call sites (topic, module, curriculum, and gap deletion itself) clean up the
      corresponding `gap_mastery` row. Not a corruption risk today — every reader reaches
      `gap_mastery` by joining through `gaps`, so an orphaned row is simply invisible, never
      misattributed — but it's an unbounded, invisible leak that will just grow over time.
      Pointers: `apps/api/src/gap/gap-mastery.repo.ts`, the four deletion call sites named above
      (grep for where `gaps` rows get deleted).
      Done when: deleting a gap (directly, or via its parent topic/module/curriculum) also removes
      its `gap_mastery` row, either via a real `ON DELETE CASCADE` FK or an explicit delete in the
      same transaction — proven by a test that deletes a gap with an active mastery row and
      confirms zero orphaned `gap_mastery` rows remain.

- [ ] Give `tracked_tool_scan_state` a subject dimension before seeding a second gated subject.
      Why: `.planning/doc-changelog-scan/todo.md` (found during implementation, 2026-07-28) —
      the table is keyed by `tool_key` alone, so only the first of multiple gated subjects
      processed in a scheduled scan run ever gets real suggestions; every other subject silently
      gets nothing, indefinitely. Invisible today (exactly one gated subject exists,
      "Programming / Web Development") but becomes a real correctness bug, not a performance one,
      the moment a second subject gets its own domain_nodes tree — deliberately not patched
      quietly inside that ticket's scope, since it's a real schema change a human should decide on.
      Pointers: `apps/api/src/domain-map/doc-scan.orchestrator.ts`
      (`runDocScanForAllTrackedSubjects`), `apps/api/src/db/schema.ts`
      (`tracked_tool_scan_state`) — needs a composite key on `(subject_id, tool_key)`.
      Done when: two gated subjects both genuinely receive independent doc-scan suggestions in
      the same scheduled run, proven by a test exercising exactly that interleaving.

- [ ] Close the doc-scan review screen's double-click duplicate-node bug and two related
      hardening gaps.
      Why: `docs/architecture/doc-changelog-scan/review.md` (found during `/debrief` 2026-07-28)
      found accepting a suggestion twice via a plain double-click can insert a duplicate real
      `domain_nodes` row — `resolveDomainTopicSuggestion()`/`resolveDomainSupersessionSuggestion()`
      don't check `status === "pending"` before acting, and the review panel's accept/reject
      buttons have no in-flight disabled state (unlike the page-level "Scan now"/"Run review"
      buttons, which already guard against this same class of bug). Two related, smaller
      hardenings found in the same review: the scan's own watermark read-compare-write has no
      lock, risking duplicate suggestions from an overlapping manual scan + scheduler tick; and
      `infra/index.ts`'s `apiSharedSecret ? {...} : undefined` deploys silently with no
      Authorization header if the one-time Pulumi secret step is skipped, rather than failing
      loudly at deploy time.
      Pointers: `apps/api/src/domain-map/domain-map.repo.ts` (add a `WHERE status = 'pending'`
      guard to both resolve functions), `apps/web/src/domain-map/priority-review-panel.tsx` (add
      a per-item disabled/in-flight state, mirroring the page-level buttons' existing pattern),
      `apps/api/src/domain-map/doc-scan.orchestrator.ts` (the watermark race), `infra/index.ts`
      (swap to `config.requireSecret()`).
      Done when: a real double-click (or two rapid concurrent PATCH calls) on the same pending
      suggestion results in exactly one resolution — one succeeds, the second is a clean no-op or
      error, never a second real node/flag.

## Everything else (unchanged order, resumes below the active queue above)

- [x] Add subject pedagogy-kind + a language-practice agent set — the architectural foundation
      for merging the standalone English-practice app in as a new subject.
      [→ done: .bmad/english-subject-merge/, verified 2026-07-22, built on branch
      `english-subject-merge` (this checkout — same tree as main, not a separate worktree).]
      Why: every subject today shares the same 7 hardcoded Mastra agent prompts
      (`apps/api/src/mastra/*.agent.ts`), all built around one pedagogy — "senior architecture
      mentor, never test recall or syntax" (see `.product/PRINCIPLES.md`). English practice
      (translate a sentence, get scored for native-soundingness, track phrase mastery) IS
      recall/usage practice — the opposite of that principle. This item proves out, end to end
      for one real interaction (not the full feature set yet), that a subject can carry a
      pedagogy kind and get genuinely different agent behavior without changing anything about
      existing subjects.
      Decisions already made (do not re-litigate): additive `kind` field on `subjects`
      (`architecture-mentor` default / `language-practice`); new agent files registered under new
      `AGENT_KEYS` entries alongside the existing ones (never edit the existing 7 agent files or
      their instructions) — keeps this cleanly reversible if the merge gets undone later, per the
      user's explicit "I might change my mind" constraint.
      Pointers: `apps/api/src/db/schema.ts` (`subjects` table), `apps/api/src/mastra/mastra.ts`
      (`AGENT_KEYS`, static agent registry — agents are singletons created once, not per-request),
      `apps/api/src/mastra/mentor.agent.ts` + `probe-quiz.agent.ts` (the pattern to mirror for new
      language-practice agent files). Plan at `.bmad/english-subject-merge/`.
      Done when: a subject can be created with `kind: language-practice`, and at least one probe
      interaction against a topic under that subject visibly uses different agent instructions
      (recall/usage-based, not Socratic "why") than the same interaction under an
      `architecture-mentor` subject — proven by a real e2e test, not a self-report.
- [x] Port the English batch-practice engine as English-subject data model + UI.
      [→ done: english-batch-practice branch (merged to main), e2e S1-S6 all pass 2026-07-25.]
      Why: post-anki's curriculum → topic → probe model doesn't fit "translate this sentence, get
      scored" — this needs its own data shape. Depends on the pedagogy-kind foundation above.
      Pointers: source app `src/practice/practice.server.ts`, `src/practice/use-practice-batch.ts`,
      `src/practice/batch-practice.tsx`, `baml_src/` (generation/grading prompts to translate to a
      Mastra agent — BAML → Mastra is a real translation, not copy-paste). No plan yet.
      Done when: an English subject generates a batch of translation sentences, the user answers,
      and gets scored for native-soundingness — the same practice loop as the source app, running
      inside post-anki.
- [x] Port phrase-bank spaced repetition with mastery tracking to the English subject.
      [→ done: phrase-bank-mastery branch (merged to main), verified 2026-07-25 — 576/576 targeted
      + full-suite tests, typecheck clean, real headless-browser proof of the recycled badge and
      phrase-bank panel rendering. Note: the source app's own algorithm doc was genuinely
      ambiguous on how many correct isolated reps a struggling phrase needs before it counts as
      "rescued" — the plan picked the simpler reading (one correct answer) as a reversible
      default; see spec.md decision 6 if this needs revisiting.]
      Why: this is the source app's actual differentiator — active recycling of weak phrases,
      3-non-adjacent-correct-uses mastery rule, failure rollback to isolation. Depends on the
      batch-practice port above existing to attach to.
      Pointers: source repo's `learning/active-phrases.json` / `mastered-phrases.json` shape and
      the recycling rules in its `CLAUDE.md` (`spaced_repetition_algorithm.md`,
      `phrase_bank_philosophy.md` referenced there). No plan yet.
      Done when: a phrase that's been answered correctly 3 times non-adjacently is archived as
      mastered, and a struggling phrase gets re-surfaced according to the isolation-then-retry
      rule — visible in the UI, not just the database.
- [ ] Migrate existing English practice data into post-anki's database.
      Why: the source app's Neon tables (`settings`, `phrases`, `attempts`) and the separate
      chat-session phrase-bank JSON files both hold real practice history that shouldn't be lost
      when the source app is retired. Do this last, once the English subject's schema in post-anki
      is stable — migrating into a schema that's still changing would mean redoing the mapping.
      Pointers: source repo's Neon connection (see its `ARCHITECTURE.md`), `learning/*.json` in
      the canonical source repo. No plan yet.
      Done when: a one-time import script has run, existing attempt history and mastered/active
      phrases are visible in post-anki, and the source repo/worktree can be safely archived.
- [ ] Build a simple React Native mobile app for Post Anki, reusing the existing `apps/api`
      backend contract (the same one the local-first Electric sync work already built the
      gatekeeper for — see `.planning/local-first-electric-sync/spec.md` and
      `docs/architecture/local-first-electric-sync.md`) rather than standing up a parallel
      backend. Start with the core study/review flow, not full feature parity with the web app.
      [→ in progress, not done: planned + built 2026-07-17, merged to main 2026-07-25 (commit
      `5d3afb5`). Backend (`api_tokens` PAT auth, additive to the existing shared secret) is
      verified end-to-end on `main` — real token minted via `create-api-token.ts` against the dev
      DB, a real curl with that token got 200 from `GET /subjects`, a bogus/missing token got 401;
      typecheck + full vitest suite (471 files, 4125 tests) clean post-merge. Blocked on: no iOS
      Simulator / Android emulator on this machine, so the Connect/Today screens have never
      actually rendered — needs a physical device with Expo Go before this can be marked done.]
- [ ] Build a Tauri desktop app for Post Anki wrapping the same web app / reusing the same
      `apps/api` backend, so the same account and data are available on desktop without a
      separate backend.
      [→ in progress, not done: planned + built 2026-07-17 at `.planning/tauri-desktop-app/`,
      code sitting uncommitted in worktree `.claude/worktrees/tauri-desktop-app`
      (branch `tauri-desktop-app`). Design is a pure webview wrapper around the deployed
      apps/web origin — apps/web and apps/api are untouched, and the shell holds zero backend
      credentials (independently re-confirmed by grep). Config validity and the retry-on-failure
      logic are verified with real tests. Blocked on: no Rust toolchain (cargo/rustc/rustup) on
      this machine — `npx tauri dev` was actually run and failed at the exact expected
      `cargo metadata` step, so the shell has never actually launched or rendered anything. Needs
      a Rust-equipped machine to get past that before this can be marked done.]
- [x] Lecture mode — short, curated background material per topic, compiled from respected
      external sources.
      [→ done: .bmad/lecture-mode/, verified 2026-07-25, e2e S1-S4 all pass.]
      Why: today the only inputs to a curriculum are the learner's own pasted text/doc links and
      the probe/study-chat agents' own generated explanations — there's no step that hands the
      learner a short, pre-written briefing stressing the important points before they get probed
      on a topic. Lecture mode adds that: a compact read (or listen) compiled from genuinely
      respected external sources — blogs, papers, articles — favoring material from top AI
      companies/labs or well-known named practitioners over generic SEO content, mirroring the
      "trusted sources" bar already enforced for research grounding elsewhere in the app (approve/
      reject source review, never auto-trust arbitrary search results).
      Pointers: `apps/api/src/curriculum/doc-link-grounding.ts` and `tech-research-grounding.ts`
      (existing patterns for pulling in and grounding on external material), `apps/api/src/topic/
      topic.repo.ts` (where a new lecture artifact would likely attach per-topic).
      Done when: at least one topic has a generated lecture compiled from real, cited external
      sources (not fabricated), the learner can read it before probing starts, and the source list
      behind it goes through the same approve/reject review as other supplemental research rather
      than being auto-trusted.
      Needs real product/architecture planning first (how lecture content is generated/refreshed,
      where it sits relative to probe/study-chat, source curation and citation format) — this
      entry queues the idea, it does not spec it.
- [ ] One daily touchpoint instead of three separate practice surfaces to remember to open.
      Why: a user today has to separately remember to open the web curriculum probe, the
      Telegram bot (quiz/Socratic), and English batch-practice — three entry points with no
      single place that already knows what's due across all of them. A single daily digest
      (Telegram, since it's already the primary channel — see issue #50/#55) that surfaces one
      due phrase-bank recycling item, one cross-cutting gap nudge (if the generalized gap
      tracking above ships), and one architect-mentor probe question turns three things a user
      must remember into one thing the system starts for them — a real retention lever, not a
      new content type.
      Pointers: `apps/bot/` (existing Telegram bot, already the shipped daily-push channel per
      issue #55's audit), `.planning/telegram-quiz-socratic-selection/` (existing bot
      scenarios/wiring to extend rather than duplicate).
      Done when: one Telegram message per day surfaces due items pulled from more than one
      practice surface (not just one subject/mode), and tapping into it resumes the right
      session directly rather than dropping the user at a generic menu.
      Needs real product/architecture planning first — how "due" is computed across
      fundamentally different practice types (spaced-repetition phrases vs. open-ended probe
      questions), and how much to surface in one message before it becomes noise. This entry
      queues the idea, it does not spec it. (#58)
