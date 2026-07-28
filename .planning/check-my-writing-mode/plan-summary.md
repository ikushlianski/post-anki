---
type: plan-summary
branch: check-my-writing-mode
state: confirmed
updated: 2026-07-28
---

# Plan summary — Port "check my writing" to the English subject

Port of an already-built, already-verified feature (source:
`english-advanced/language-learning-app-local-only@fc8dd25`) onto post-anki's real architecture.
Unattended planning run — every fork resolved with a reversible default, logged in `discussion.md`.

## What ships

- A user on a `language-practice` subject pastes arbitrary English text (Slack message, PR
  description, email — no reference translation) at `/practice/:subjectId/check-writing`, clicks
  Check, and gets a 0-10 native-soundingness score, verdict (Ok/NeedsReview/NeedsDeepDive), 1-2
  sentences of feedback, and 1-2 full native rewrites of the whole text.
- Every check is persisted (`writing_checks` table, scoped to the subject) and shown newest-first
  in a history list on the same page, surviving reload.

## What's different from the source app (by design, not oversight)

| Source app | This port | Why |
|---|---|---|
| Electric/TanStack-DB sync for history | Plain REST + react-query (mirrors `phrase-bank-panel.tsx`) | Post-anki just fixed a real production Electric-only-read hang one wishlist item ago; no live-multi-client requirement here |
| No subject concept (global `/check-writing`) | Scoped to a `language-practice` subject, `subjectId` column, route under `/practice/:subjectId/check-writing` | Post-anki's whole English feature set is subject-scoped |
| Ad-hoc `CREATE TABLE` against Neon (no migration tool existed) | Real Drizzle migration (`db:generate:api` / `db:migrate:api`) | Post-anki has Drizzle; the source's ad-hoc reasoning doesn't apply here |
| New BAML function `GradeFreeText` | New Mastra agent (`AGENT_KEYS.writingCheck`), new file, existing 8 agents untouched | Post-anki has no BAML — all LLM calls go through Mastra |
| Scenario S3: new server-fn + Electric shape reject unauthenticated requests | Dropped, reasoned explicitly in `playwright.md` | Post-anki's auth is one global gate in front of every route (`server.ts`'s `authorized()`), not per-route middleware — nothing to forget to wire |

## Files

`.planning/check-my-writing-mode/spec.md`, `scenarios.md`, `discussion.md`, `playwright.md`,
`state-fixtures.md`. No `architecture.md` — additive feature on already-existing architecture (new
table on the existing Postgres/Drizzle pipe, new agent on the existing Mastra registry), same
reasoning the source app itself used for skipping one.
