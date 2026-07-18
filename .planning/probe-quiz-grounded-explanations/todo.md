---
type: todo
branch: probe-quiz-grounded-explanations
task: Probe quiz per-option explanations, grounded anti-hallucination citations, and explicit full-batch generation
state: open
updated: 2026-07-15
---
# Todo: Probe quiz grounded explanations

This plan ran fully autonomously (no `AskUserQuestion` — unattended). Every fork resolved with a recommended default per the recommended-default rule. Full reasoning is in `spec.md`'s "Decisions made autonomously"; this file logs the same calls briefly for a quick review, plus what's still genuinely open.

## Judgment calls made autonomously (for review — none block confirmation)

1. **This plan hard-depends on `topic-study-experience` merging first** — nearly every file it touches doesn't exist in its needed shape on `main` yet. Not a preference, a correctness requirement (see `architecture.md`).
2. **New `reindexParallelArray` deriver instead of widening the sibling's `reindexOptions` signature** — avoids touching a function whose exact contract is already specified and possibly mid-implementation elsewhere.
3. **Citation validation is a pure post-generation filter reusing already-fetched grounding text and existing `sources.value` URLs** — no new fetch, no new persistence, no second LLM call.
4. **Fail-closed per option, not per question** — one bad citation nulls one field, not the whole question.
5. **Batch-size uncap applies to both topic scope (the real web feature) and module scope (bot-only today)** — accepted as a deliberate, logged side effect on the bot's existing module quiz rather than forking the sizing logic per caller.
6. **`optionExplanations` nullable everywhere**, to tolerate pre-migration rows without a backfill.

## Decisions to make
Nothing to decide — every fork above has a committed default.

## To review / clarify
- **File-collision risk, not coordinated live:** `probe-quiz.agent.ts`, `apps/api/src/db/schema.ts`, and `probe-session.{generate,map,repo,service}.ts` are touched by `topic-study-experience` first and then again by this plan. Safe only if implemented strictly in that order (see hard prerequisite). If either branch's implementation drifts out of that order, expect merge conflicts in the agent instruction string and missing symbols in the schema/repo files.
- **Two other parallel planning agents** (personal-learning-map chat + stats dashboard; feedback/promote-demote/ordering) may also touch `probe-quiz.agent.ts`'s instructions or `probe-session.generate.ts` if their scope turns out to need question-generation changes — not confirmed from anything read during this plan, just flagged per task instructions since three separate plans converging on one agent's instruction string is a real risk if it happens.
- **`gatherProbeGrounding`'s web-search fallback branch is shared with `apps/api/src/probe/probe.service.ts`** (the old single-question `today.tsx` flow, explicitly out of scope for both this plan and its sibling) and `apps/api/src/socratic/socratic.service.ts`. This plan only widens `ProbeGrounding`'s return shape (an additive field, `citations`) — existing consumers that don't read it are unaffected — but worth a quick diff-check at implementation time that neither of those call sites breaks on the wider return type.

## Manual steps
- After `topic-study-experience`'s migration has landed, run `npm run db:generate -w @post-anki/api` again to generate this plan's follow-up migration (the `option_explanations` column), then `npm run db:migrate -w @post-anki/api` against the local dev DB before testing. Do not attempt to hand-edit or combine this into the sibling's migration file.

## Post-deploy checks
- Generate a quiz on a topic whose curriculum has real `llms_txt`/`web_research` sources and confirm at least one option shows a real, clickable citation link that matches a URL actually present in that curriculum's `sources` rows.
- Generate a quiz on an older/thin-sources curriculum and confirm the quiz still generates, with explanations but no citation links.
- Spot-check a shuffled multi-option question and confirm each option's explanation text still matches that specific option's content after shuffling (not misaligned from the original generation order).
- Generate a quiz on a topic with many open gaps/concepts and confirm the batch is noticeably larger than the old flat 12/20 caps, without an unreasonable runaway count.
