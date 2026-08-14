---
type: todo
branch: 96-adaptive-quiz-size
task: "Cap topic-scope quiz size and stop early on strong mastery signal (#96)"
state: open
updated: 2026-08-14
---

# Todo: Adaptive quiz/probe generation count (#96)

## Decisions to make

Nothing blocking. Every fork in this story had a safe, reversible, pattern-following default — 8
of them, logged one line each below for `ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in
`spec.md` §"Decisions made autonomously". None touches money, auth, schema, or an irreversible data
decision — no migration, no new table, no new route. Nothing here needs Ilya before implementation
starts.

1. `TOPIC_QUIZ_CEILING = 20`, bracketed by this package's own existing `MODULE_TARGET` (16) /
   `CURRICULUM_QUIZ_MAX_TOTAL` (20) precedents.
2. Ceiling-before-floor clamp ordering, so a future `ceiling < floor` caller mistake still can't
   return below the floor.
3. `EARLY_MASTERY_MIN_SAMPLE = 5`, threshold 4-of-5 (80%), integer-safe comparison — loosely
   mirrors gap-mastery's own 3-correct-in-a-row single-gap threshold, scaled up for a coarser
   whole-session judgment.
4. Cumulative session-wide accuracy, not windowed, not per-topic — cheapest faithful reading of
   "early signal"; long-session inertia limitation disclosed, not hidden (see item 1 below).
5. The gate applies uniformly to topic, module, and tag scope, not topic-only — it composes on the
   scope-agnostic replenish path, which was equally unbounded for all three.
6. The initial batch stays one call (now bounded), not restructured into fixed increments — module
   scope's distribution plan is hardcoded to `MODULE_TARGET` independent of the requested total, and
   even topic-scope-only chunking would trade a now-solved problem for repeated re-grounding cost.
7. The web client mirrors the gate via a direct `@post-anki/core` import (no duplicated literal),
   purely to skip a wasted refetch — correctness doesn't depend on it.
8. No schema change, no migration — the capped target is cheaply recomputable, and the mastery
   signal reads fields already persisted on `probe_sessions`.

## To review / clarify (not blockers, flagged for awareness)

1. **Cumulative accuracy has real inertia on long, uneven sessions.** A module/tag session that
   started weak and later goes on a strong streak won't trip the early-stop gate until the *running
   average* clears 80%, not the recent trend — spec.md Decision 4, scenarios.md SCENARIO 5. A
   windowed ("last N") variant would need a DB read on every answer before the gate can run
   (`loadSession` today only happens after the replenish lock is claimed) — judged not worth that
   per-answer cost for every session to serve a comparatively rare long-uneven-session case. Worth a
   follow-up if this turns out to matter in practice.
2. **Capping the initial batch shifts cost from "one large call" to "more, smaller calls" for a
   struggling learner on a heavily-gapped topic who keeps practicing without ever tripping the
   mastery gate.** A 40-gap topic that used to generate 60 questions in one call now generates 20
   initially plus 10-question top-ups as the learner works through it — each top-up re-runs
   `gatherProbeGrounding` from scratch (`probe-session.generate.ts:509-569`,
   `probe-grounding.ts:42-146`), which can include a real external web-search call when the
   curriculum has no pasted material. Judged the right trade (spec.md Decision 6: bounds the acute
   "200+ in one shot, most never consumed" waste unconditionally; the alternative of chunking the
   initial batch too doesn't remove this cost, it just relocates where it's paid), but it is a real,
   disclosed two-sided tradeoff, not a free win. Caching grounding per session across replenish
   calls is a legitimate, separate follow-up.
3. **`probe-session-quiz.test.tsx` has no existing `invalidateQueries` spy.** The test wrapper
   already constructs a real `QueryClient` (line 70) but nothing currently asserts on
   `invalidateQueries` calls — AC 18/19 need `vi.spyOn(queryClient, 'invalidateQueries')` added to
   that wrapper. Small (one line), but net-new test infrastructure in that file, not a pattern
   already in use there — call it out in the PR rather than treating it as a pre-existing hook.
4. **A leftover worktree carries stale copies of the two files this story touches.**
   `.claude/worktrees/agent-a8fbd0bd564e4afe8/` has its own copies of
   `packages/core/src/probe-session/quiz-size.ts` and `apps/api/src/probe-session/
   probe-session.generate.ts` (confirmed via `find`, 2026-08-14). Not this story's to clean up, but
   implementation should exclude that path from any repo-wide grep/verification pass, and nobody
   should edit the copy under that worktree by mistake — it is not the file this plan targets.

## Manual steps / sequencing constraints

None. No migration, no infra change, no new secrets or config. Standard implement → typecheck →
test → PR flow.

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to every workspace)
- `npx vitest run` (root) — in particular the rewritten `quiz-size.test.ts` and the new
  `hasEarlyMasterySignal` cases in `replenish.test.ts`
- `npm run test:integration -w @post-anki/api` — needs `npm run e2e:db:up` (docker, port 5436)
  first, for the new `probe-session-replenish.integration.test.ts`
- No repo-wide ESLint exists (verified during #33's planning, still true) — the typecheck gate is
  the lint gate.

## Easiest things to get wrong (read before implementing)

1. **Clamp ordering in `scaleTopicQuizTotal`.** `Math.max(floor, Math.min(ceiling, proportional))`,
   NOT `Math.min(ceiling, Math.max(floor, proportional))` — the latter can return a value below
   `floor` if a caller ever passes `ceiling < floor`. AC 4.
2. **`hasEarlyMasterySignal` must be an integer comparison**, not `correct / answered >= 0.8` —
   floating point invites a boundary test that looks flaky for no reason. AC 7.
3. **The mastery gate goes in `maybeReplenish`, not `shouldReplenish`.** `shouldReplenish` is a
   generic "is remaining below floor" check reused elsewhere in its exact current form (the client
   mirrors it too) — do not fold the new condition into it. Compose the gate as a second, separate
   early-return, and keep `shouldReplenish`'s own test file (including its "can keep growing"
   case) completely unmodified as the no-regression proof. AC 12.
4. **`maybeReplenish`'s `progress` parameter needs `correct` added to its type** — it's already
   being passed at the call site (`syncSessionCounters`'s return value has it), so this is a
   type-only change, not a new plumbing path. Don't add a second query to fetch it. AC 13.
5. **Don't touch `apps/bot/src/quiz/quiz-flow.ts` or the mobile study-loop surface.** Neither
   independently decides whether to replenish — both just re-read session state after answering.
   Confirm they appear in no diff rather than assuming it. AC 16.
6. **Rename, don't just re-assert, `quiz-size.test.ts`'s "has no hardcoded ceiling" case.** The
   rule it tests is inverted by this story — per this project's own testing convention, a test whose
   underlying business rule changed needs its name updated too, not just its assertion. AC 5.
7. **The integration test needs its positive control in the same file.** A test only asserting the
   mocked agent was *not* called can pass vacuously if the seeded scenario never actually crosses
   the replenish floor. Seed the low-accuracy twin with identical scenery and assert the agent IS
   called on it, in the same test file. AC 20.

## Follow-ups this story deliberately does not build

- A windowed ("last N answers") or per-topic mastery signal instead of cumulative session-wide (To
  review item 1).
- Caching `gatherProbeGrounding`'s result across a session's replenish calls, to remove the
  re-grounding cost the capped-initial-batch tradeoff introduces for a genuinely-practicing learner
  (To review item 2).
- Restructuring the initial batch into fixed-increment generation for any scope (spec.md Decision
  6) — would additionally require decoupling module/tag scope's distribution plan from its
  hardcoded `MODULE_TARGET`.
- Any new session status, "stopped early" flag, or user-facing messaging about why a session ended
  up shorter than its scaled target.
