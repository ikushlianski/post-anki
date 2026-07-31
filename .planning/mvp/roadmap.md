---
type: mvp-roadmap
state: active
updated: 2026-07-31
---

# PostAnki MVP roadmap

## Goal

Start real-world learning this week — Turbo Puffer urgently within days, plus ongoing RAG strategies/AI best practices/Next.js depth — using the app's already-shipped core loop (course creation → lecture → quiz/Socratic → mastery tracking), while juggling four subjects concurrently without losing track of any.

## MVP-critical (build/complete these, in priority order)

- [x] Make `clearCurriculumStructure` provenance-aware so merges never lose data. (#68)
  Why MVP: core-loop data-loss bug reachable through routine use (Retry research after a merge). Merged 2026-07-31.

- [x] Add course-level priority reordering with drag-and-drop manual override on web. (#69)
  Why MVP: directly enables juggling multiple courses — one day Turbo Puffer urgent, next day RAG priorities shift. Merged 2026-07-31.

- [x] Surface a "refocus" suggestion when priorities have meaningfully shifted across courses. (#70)
  Why MVP: makes multi-course priority shifts automatic ("you've ignored course X, Y is now urgent"), not manual. Depends on #69. Done 2026-07-31, debriefed sound.

## Backlog (explicitly deferred — do not build via /grand-loop until MVP is done)

- [ ] Build a "quick session" entry point: tap once, land on the single most relevant question across all courses. (#71)
  Deferred: friction-reduction convenience on top of working priority system, not the tracking mechanism itself. Depends on #69/#70.

- [ ] Fix `reorderModules` to validate module ids against the curriculum named in the URL. (#75)
  Deferred: latent data-integrity hardening found during #69 build; reachable only via malformed payload, not routine UI use.

- [ ] Confirm (then build if missing) a four-point self-grade scale on free-form Socratic questions. (#73)
  Deferred: polish/refinement of grading UI on a mastery engine that already works and generalizes correctly. Core loop does not require this variant.

- [ ] Add ontology split (subject/course/tag) as fast-follow to the merge-only management already shipped. (#72)
  Deferred: ontology hygiene / operational housekeeping, not core-loop functionality. No blocker for real-world study.

- [ ] Bring the mobile app to functional parity with web: course creation, merge, split, priority reordering. (#74)
  Deferred: explicitly depends on web-side items landing first; mobile consumption-only (study) is built, management is not yet needed this week.

- [ ] AI-assisted duplicate detection: surface likely-duplicate subjects for merge. (#63)
  Deferred: operational hygiene, not learning-loop critical.

- [ ] Close the phrase-bank's deadlock window between the two new locks. 
  Deferred: hardening edge case (rare concurrent interleaving); no data loss, just aborts cleanly with a 500.

- [ ] Close the `createCurriculum`-vs-merge race and harden TagPicker's live-refresh gap.
  Deferred: latent races and UI flakiness, not blocking real study.

- [ ] Make a zero-suggestion priority review fail loudly instead of silently clearing the "review due" banner.
  Deferred: edge case error handling, not blocking real study.

- [ ] Migrate existing English practice data into post-anki's database.
  Deferred: data migration, not a learning-loop function. English practice subject already operational.

- [ ] Build a simple React Native mobile app, reusing the existing backend (core study/review flow only).
  Deferred: mobile platform launch, not needed this week; web is primary for Turbo Puffer/RAG/Next.js setup.

- [ ] Build a Tauri desktop app wrapping the same web app and backend.
  Deferred: desktop platform launch, explicitly not needed this week.

- [ ] One daily touchpoint instead of three separate practice surfaces (Telegram digest).
  Deferred: multi-surface convenience aggregation; each surface already works individually.

- [ ] Job market + community trend scanning, grouped by country.
  Deferred: explicitly postponed by user previously; not part of this week's learning goals.

- [ ] Fix the `+ tag` button's silent no-op click on a far-scrolled page position.
  Deferred: UI flakiness, not core-loop blocker.

- [ ] Fix the shared `waitForHydration` helper to wait for real hydration, not just router presence.
  Deferred: test infrastructure (e2e flakiness); product behavior is working.

- [ ] Add a regression test for the mobile transport-security guard.
  Deferred: test coverage, not product functionality.

- [ ] Give `tracked_tool_scan_state` a subject dimension before seeding a second gated subject.
  Deferred: schema edge case, invisible until a second gated subject is seeded.

- [ ] Close the doc-scan review screen's double-click duplicate-node bug and related hardening gaps.
  Deferred: UI robustness edge cases, not blocking real study.

## Already shipped, relevant to the MVP goal (confirm—don't build)

### Core technical-subject learning pipeline
- **Course creation from docs link**: name a subject, paste a docs URL, pick a level, get an AI-generated curriculum breakdown into modules/topics. (shipped doc-link-technology-intake, plan.md Ticket 1)
- **Curriculum generation**: subjects auto-generate a starter curriculum with modules and topics (shipped seed-knowledge-map, plan.md Ticket 1)
- **Lecture mode**: short, curated background material per topic compiled from external sources before probing starts (shipped 2026-07-15, plan.md Ticket 10)
- **Quiz/trivia batches**: minimal-code, concept-first questions with randomized options (shipped phrase-bank and batch-practice, plan.md Ticket 8)
- **Adaptive probe sessions**: small initial batch, later questions adjust to answers already given (shipped probe-session, plan.md Ticket 7)
- **Socratic conversations**: free-form question → gap analysis → blind-spot tracking, including a persistent sidebar chat with cross-curriculum learning-map context (shipped decide-mode + learning-map-chat 2026-07-15, plan.md Ticket 10)
- **Spaced-repetition mastery tracking**: missed probe/quiz questions resurface as gaps, archive as resolved after 3 non-adjacent correct demonstrations; generalizes across all subject kinds (shipped generalize-gap-tracking, plan.md Ticket 9)
- **Subject pedagogy kinds**: subjects carry a `kind` (architecture-mentor default, or language-practice) and get genuinely different agent instructions accordingly (shipped english-subject-merge)

No build work needed on these — they already function end-to-end for real subjects. Verify they work for Turbo Puffer/RAG/Next.js/AI-practices intake, don't re-implement.
