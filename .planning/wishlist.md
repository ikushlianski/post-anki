# Post Anki wishlist

Priority order — top is highest priority. `/grand-loop` picks the first `- [ ]` item.

- [ ] Build a simple React Native mobile app for Post Anki, reusing the existing `apps/api`
      backend contract (the same one the local-first Electric sync work already built the
      gatekeeper for — see `.planning/local-first-electric-sync/spec.md` and
      `docs/architecture/local-first-electric-sync.md`) rather than standing up a parallel
      backend. Start with the core study/review flow, not full feature parity with the web app.
      [→ in progress, not done: planned + built 2026-07-17 at `.planning/mobile-study-review-app/`,
      code sitting uncommitted in worktree `.claude/worktrees/mobile-study-review-app`
      (branch `mobile-study-review-app`). Backend (new `api_tokens` PAT auth, additive to the
      existing shared secret) and the Expo app's TypeScript/bundle layer are verified — real
      tests, real curl checks, real typecheck, all independently re-confirmed. Blocked on: no iOS
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
