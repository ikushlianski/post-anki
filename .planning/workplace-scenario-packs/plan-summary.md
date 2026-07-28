---
type: plan-summary
branch: workplace-scenario-packs
state: confirmed
updated: 2026-07-28
---

# Plan summary — Port workplace scenario packs to the English subject

Not a build — a verification-gap ticket. The pack picker, per-pack agent theming, and per-pack data
model this wishlist item asks for already exist on `main`, byte-for-byte matching the source app's
own `.bmad/workplace-scenario-packs/spec.md` decisions. They landed as scaffolding-ahead-of-need
during two earlier, already-shipped wishlist items ("Port the English batch-practice engine",
"Port phrase-bank spaced repetition with mastery tracking"), not from this ticket. Unattended
planning run — every fork resolved with a reversible default, logged in `discussion.md`.

## What ships

Three e2e scenarios proving the already-built pack feature actually works end to end — nothing
about the product changes:
- A selected pack survives a page reload (DB-backed, not just component state).
- Selecting a named pack (`CodeReview`) provably themes the generated batch — both the rendered
  sentences and the stored `phrases.pack` column, not just the button's pressed state.
- Switching back to `General` produces clean, untainted generic content, with the earlier themed
  batch's rows left untouched in history.

The one real change: the e2e mock LLM's phrase-batch responder, currently pack-blind (returns the
same generic content no matter which pack is requested), becomes pack-aware — parsing the real
`Pack: <X>` line the app already embeds in its generation prompt and returning pack-specific themed
content, with a strict throw on anything outside the 5-value pack enum (no silent default/wildcard
fallback). This closes the same "a stub can silently satisfy the wrong pack's request" risk the
source app's own commit named and fixed, adapted to post-anki's pure-function-of-the-request mock
shape instead of the source's stub-queue-and-tag mechanism.

## What's explicitly out of scope

| Item | Why |
|---|---|
| Any application code change | The feature is already fully built — see `spec.md`'s "Headline finding" |
| The retry-storm-guard bug fix the source commit bundled | Already independently handled, more thoroughly, by `use-practice-batch.ts`, already e2e-proven by `@english-batch-practice.S5` |
| Themed mock content for StandupUpdates/IncidentPostmortems/GivingFeedback beyond the strict-match requirement | No scenario in this plan reads their content; a future ticket picking one extends the same branch |
| Migrating historical practice data | Separate, already-listed wishlist item |

## Files

`.planning/workplace-scenario-packs/spec.md`, `scenarios.md`, `discussion.md`, `playwright.md`,
`state-fixtures.md`. No `architecture.md` — the one file this plan touches
(`mock-openrouter/responses.ts`) is e2e test infrastructure, not product architecture.
