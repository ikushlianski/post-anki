# Post Anki wishlist

Priority order — top is highest priority. `/grand-loop` picks the first `- [ ]` item.

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
- [ ] Port phrase-bank spaced repetition with mastery tracking to the English subject.
      Why: this is the source app's actual differentiator — active recycling of weak phrases,
      3-non-adjacent-correct-uses mastery rule, failure rollback to isolation. Depends on the
      batch-practice port above existing to attach to.
      Pointers: source repo's `learning/active-phrases.json` / `mastered-phrases.json` shape and
      the recycling rules in its `CLAUDE.md` (`spaced_repetition_algorithm.md`,
      `phrase_bank_philosophy.md` referenced there). No plan yet.
      Done when: a phrase that's been answered correctly 3 times non-adjacently is archived as
      mastered, and a struggling phrase gets re-surfaced according to the isolation-then-retry
      rule — visible in the UI, not just the database.
- [ ] Port workplace scenario packs to the English subject.
      Why: themed content packs (standup updates, code review, incident postmortems, giving
      feedback) already exist and were verified working in the source app this session.
      Pointers: source repo `.bmad/workplace-scenario-packs/`, `.planning/LOG.md` entry for
      2026-07-18. No plan yet.
      Done when: a pack picker themes generated batches the same way it does in the source app.
- [ ] Port "check my writing" freeform scoring to the English subject.
      Why: turns English practice into a daily-use utility for real work writing, not just
      scheduled drills — already built and verified in the source app this session.
      Pointers: source repo `.bmad/check-my-writing-mode/`. No plan yet.
      Done when: pasting free text gets a native-soundingness score + rewrites, saved to a history
      list, same as the source app.
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
- [ ] Seed subjects and courses/topics — incremental domain/technology intake, grown over time
      rather than fixed at creation.
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
- [ ] Periodic doc/changelog scan — surface new topics and adjust knowledge-map percentages
      over time, without overwhelming the user.
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
- [ ] Per-domain expertise priority, with a monthly re-prioritization review.
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
- [ ] Job market + community trend scanning, grouped by country.
      Why: priority (#52) shouldn't be based on personal interest alone — regularly scan job
      market demand by technology, grouped by country (US, Europe, Russia, Belarus, Poland),
      surfacing what's gaining traction worldwide, plus lightweight Reddit/X monitoring as a
      cross-check for real trend signal (not just "a nerd programmer said it's important").
      Explicit constraint from the user: the social-monitoring piece should stay light-touch, a
      cross-check not the primary driver — not meant to be an aggressive social-listening
      pipeline.
      Pointers: #52 (the review this feeds into), #48 (the knowledge map the recommendations
      apply to).
      Done when: at least one scan produces country-grouped demand data plus a small set of
      recommendations without excessive noise, and a Reddit/X cross-check is demonstrated as
      lightweight supplementary signal, not a primary driver.
      Needs real product/architecture planning first — this entry queues the idea, it does not
      spec it. (#53)
- [ ] Manage the ontology over time — split or merge subjects/courses/tags.
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
