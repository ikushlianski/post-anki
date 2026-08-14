---
type: spec
run: newcomer-onboarding-and-cards
state: in-progress
started: 2026-08-07
---

# Newcomer onboarding + Anki-style cards

Feature list this moonshine-factory run builds from (assembled inline from a conversation with
the user on 2026-08-07, not a pre-existing `.planning/` tree — see LOG.md for the codebase
survey that grounded it).

## Units of work

1. **curriculum-calibration-probe** — a one-time batch of ~10-20 auto-generated questions
   spanning a curriculum's included topics/modules, taken once after structure is confirmed,
   to build an approximate per-topic strong/weak picture instead of the current manual
   self-grade-only step. Depends on: nothing (existing probe-session infra extends cleanly).
2. **anki-card-mode** — new per-topic "Cards" mode, parallel to Lecture/Socratic/Quiz. AI
   generates cards covering a topic's key concepts; each concept gets 3-5 differently-phrased
   variants so review doesn't feel visually repetitive. No fixed repeat schedule, no manual
   card authoring (AI-only generation), consistent with `.product/REJECTED.md`'s actual ban
   (auto-declared gaps) rather than a blanket flashcard ban. `.product/DECISIONS.md:179`
   previously listed this as "future" — flagged, not blocking; the user requested it directly
   with a concrete design (3-5 phrasing variants, no forced repetition).
   Depends on: unit 1 landing first — both touch `apps/web/src/routes/probe.$topicId.tsx`
   (the per-topic mode toggle), so they run sequentially, not in parallel, to avoid conflicting
   edits to the same file.

## Also folded into unit 1 (small, same-file-neighborhood polish)
- Gate the TanStack Devtools panel to dev-only in `apps/web/src/routes/__root.tsx` (currently
  renders unconditionally, including in production).
- Give the "This topic isn't available" empty state in `probe.$topicId.tsx` a way back
  (currently a dead end for a confused first-time visitor).

## Prerequisite fix (already done before this run started)
- Local dev DB (docker compose Postgres + Electric) wasn't running at all, which is why
  `localhost:3001` 500'd. Started the containers, ran migrations, reseeded subjects. Confirmed
  200 on both the API and the web app before any feature work began.
