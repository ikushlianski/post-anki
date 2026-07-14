---
type: architecture
branch: topic-study-experience
task: Dedicated topic page with multi-select quiz + reworked Socratic web chat
state: shipped
updated: 2026-07-15
---
# Architecture: Topic study experience

## What changes structurally

**No new services, no new async boundaries, no new infrastructure.** This extends two existing `apps/api` modules (`probe-session`, `socratic`) and their shared `packages/core` derivers, and adds one net-new frontend surface (a real chat UI) inside an existing route.

**Topic page is an in-place upgrade, not a new route.** `apps/web/src/routes/probe.$topicId.tsx` already is the topic-centered page reached by clicking a topic in the curriculum view — it already has the breadcrumb/header/topic-switcher-drawer/mode-toggle pattern the task asked to reuse. Rather than building a parallel page, this plan replaces what each mode renders:
- "Quick test" mode moves off the old single-question, self-graded `apps/api/src/probe/` flow (`ProbeAnswer`/`nextQuestion`/`submitAttempt`) onto the batch `probe-session` system (`prepareProbeSession`/`answerProbeSession`) — the same batch-quiz engine the Telegram bot already uses, now also reachable from the web.
- "Socratic" mode moves off the self-graded textarea (client-side "I answered it well" / "I struggled" buttons, no LLM ever consulted) onto the real `socratic` service (`startSocraticSession`/`answerSocraticSession`) — the same tutoring engine the Telegram bot already uses, now with an actual chat UI on the web for the first time.
- `apps/web/src/routes/today.tsx` (the cross-topic daily-review surface) keeps using the old single-question `apps/api/src/probe/` flow exactly as today — it's a different use case (spaced review across many topics, not one topic's dedicated page) and is out of this plan's scope.

**Multi-select is web-only, gated by an explicit flag, not a client guess.** The batch-quiz LLM prompt (`probe-quiz.agent.ts`) is the same one the bot's `quiz-flow.ts` already calls. If multi-select questions could appear unconditionally, the bot's existing single-tap inline-keyboard UI would silently break (it has no way to let a learner pick more than one option). Rather than touch bot UI (explicitly out of scope) or hope the LLM never produces one for the bot, generation takes an explicit `allowMultiSelect: boolean` (default `false`) threaded through the scope/context input. Only the new web "start quiz" call site sets it `true`. The bot's existing call site is untouched and therefore never opts in — multi-select is structurally impossible for it, not just unlikely.

**Shuffling happens once, at persistence time, inside the existing insert step.** `probe-session.map.ts`'s `buildQuestionRows` already remaps/clamps `correctAnswerIndex` defensively before insert — this is the natural (and only) place a shuffle can happen exactly once and be persisted, since `options` is stored verbatim in the `options` jsonb column and served unmodified from then on. A new pure deriver, `reindexOptions(options, permutation, correctIndexes)`, does the index remapping; a small non-deriver helper generates the random permutation (impure by nature, same category as the existing `newId()` helper — not unit-tested, the remap logic is).

**Socratic's `deriveSocraticAction` behavior change is real, not cosmetic.** Today: `give_answer` fires purely on `priorWrongCount + 1 >= 2` — the second wrong answer on a gap, full stop, with no memory of whether any attempt was ever `slightly_wrong` (partially correct). This directly contradicts the task's requirement ("must not give me the correct answer if it did not receive at least a partially correct answer from my side"). The rework adds `priorEverPartial: boolean` and `depth: DepthLevel` to the deriver's input, and a fifth action, `move_on`, for the case where the follow-up cap is hit but the learner was never partially correct — the mentor advances without revealing anything. `give_answer` is now only reachable through `priorEverPartial === true`.

**Depth caps the follow-up leash, not persisted, computed like `priorWrongCount` already is.** `awareness`/`working` depth = 1 additional follow-up turn on the same concept before resolving; `deep` = 2 (mirrors the task's "no more than one or two levels deep, shorter leash for beginners"). No new column: `priorWrongCount` is already recomputed per-call by scanning `socratic_turns` rows for the same `gapId`; `priorEverPartial` is computed the same way, by a new sibling function `hasPriorPartial`.

**A pre-existing minor layering gap gets fixed in passing.** `countPriorWrong` currently lives in `apps/api/src/socratic/socratic.map.ts`, not `packages/core`, even though it's pure computation and the constitution places pure computation in derivers. Since this plan adds its direct sibling (`hasPriorPartial`) and both feed the same deriver call, both move into `packages/core/src/socratic/escalation.ts` together — a small, low-risk consistency fix directly adjacent to the change already being made, not a standalone refactor.

**Blank-input handling is a guard clause, not a new deriver branch.** `isBlankAnswer(answer): boolean` (`answer.trim().length === 0`) is a tiny pure deriver, TDD'd like any other. But *using* it to skip evaluation entirely is a Layer-2 (controller) concern: `answerSocraticSession` checks it immediately after loading the turn and, if true, returns early — no grounding fetch, no LLM call, no DB write, the same turn is re-served untouched. This keeps `deriveSocraticAction` itself simple (it only ever sees real evaluated answers) while still satisfying "test what earns it": the blank check is a deriver, the short-circuit is a controller decision.

**Feedback composition moves from a single flaw-sentence to right+wrong.** The task's exact requested phrasing ("Yes it's partially correct. Your point X is correct but point Y is not entirely correct") requires the LLM to hand back *two* distinguishable fragments, not one. `socraticEvalSchema` gains `whatWasRight: string` alongside the existing `pointOut` (kept as "names the specific flaw"). `feedbackFor`'s `point_out` branch composes both into one sentence; `explain_hint`/`give_answer`/`advance` branches are unchanged; a new `move_on` branch uses a canned template that never references `correctAnswer`.

## New infrastructure

None.

## Data model evolution

Additive columns only, on the existing `probe_session_questions` table (Drizzle-generated migration, never hand-written/pushed — per constitution and hard constraint):

| Column | Type | Default | Purpose |
|---|---|---|---|
| `type` | text | `'single'` | `'single'` (today's behavior, unchanged) or `'multi'`. |
| `correct_answer_indexes` | jsonb (`number[]`), nullable | `null` | Full correct set for `type: 'multi'` questions. `null`/unused for `type: 'single'`. |
| `answered_indexes` | jsonb (`number[]`), nullable | `null` | Learner's full selection for `type: 'multi'` questions. `null`/unused for `type: 'single'`. |

The existing `correct_answer_index` / `answered_index` scalar columns stay exactly as they are (still `NOT NULL`/nullable respectively) and remain the source of truth for `type: 'single'` rows. For `type: 'multi'` rows, `correct_answer_index` is still populated (set to the lowest correct index) purely as a defensive redundant value for any code path not yet updated to look at the array column — grading logic for multi-select always reads `correct_answer_indexes`, never the scalar.

No schema changes for `socratic_sessions` / `socratic_turns` — `priorEverPartial`, like the existing `priorWrongCount`, is recomputed per-call from `socratic_turns` rows rather than persisted, consistent with the existing pattern.

No schema changes anywhere else (no new tables, no changes to `topics`, `curriculums`, `modules`).

## Failure modes

- **LLM omits `correctAnswerIndexes` on a `type: "multi"` question, or returns an empty array.** Handled the same way the existing code already defends against a malformed `correctAnswerIndex` (clamping, defaulting) in `probe-session.map.ts` — if a `multi` question's index array is empty or invalid after clamping, it's downgraded to `type: "single"` using its first valid index as `correctAnswerIndex`, rather than persisting an unanswerable question.
- **Bot receives a legacy or corrupted `SocraticAction` value it doesn't recognize** (e.g. an older bot deploy talking to a newer API mid-rollout, or the two new values `move_on`/`retry`). The bot's action-to-message mapping must have a default/fallback branch rather than an exhaustive switch that throws — confirmed as part of SCENARIO 10's verification, not a new code path being built, just a safety check on existing bot code.
- **Blank-answer guard false-negative** (a real answer that happens to trim to non-empty whitespace-adjacent junk, e.g. a single stray character from a dictation glitch) — accepted as out of scope per the task's explicit instruction not to over-engineer garbage detection; it goes through normal evaluation and most likely scores `mostly_wrong`, which is a safe, non-punishing outcome (still eligible for a follow-up rather than a hard fail).
- **Web chat transcript is not persisted** — only the underlying session/turn state is server-side. A page reload mid-Socratic-session resumes at the correct next question (server-authoritative), but the learner loses the visual scrollback of earlier bubbles in that browser tab. Accepted as consistent with the API's existing shape (turn-based, not a chat-log store) and not something the task asked for; documented here so it isn't mistaken for a bug later.

## Rollout

Single deploy, no feature flag needed for the *user-facing* behavior — this is a personal, single-user app and the old self-graded topic-page flow being replaced was already not the "real" system (it never called an LLM). The `allowMultiSelect` flag described above is an internal generation-time gate, not a rollout mechanism. Apply the generated migration before deploying the API build that reads/writes the new columns, per the existing `npm run db:migrate:api` step already used in this repo's deploy flow.
