---
type: spec
branch: probe-quiz-grounded-explanations
task: Probe quiz per-option explanations, grounded anti-hallucination citations, and explicit full-batch generation
complexity: complex
state: confirmed
updated: 2026-07-15
---
# Spec: Probe quiz grounded explanations

**Hard prerequisite:** do not implement this plan until `.planning/topic-study-experience/` has merged to `main` (or this branch is stacked directly on top of its branch). See `architecture.md`'s "Hard prerequisite" section — every file reference below assumes that plan's `type`/`correctAnswerIndexes`/`answeredIndexes` columns, outcome-gated reveal, `reindexOptions` deriver, and rewritten `probe-quiz.agent.ts` already exist.

### Implementation Phases

Single phase — this is a same-service extension of an already-planned system, not a new pipeline. No cross-service sequencing beyond the hard prerequisite above.

Single phase implementation.

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `reindexParallelArray` (`packages/core/src/probe-session/shuffle.ts`, added alongside sibling's `reindexOptions`) | `items: T[]`, `permutation: number[]` | `T[]` — reordered by the same permutation used for `options` | SCENARIO 4 |
| `scaleTopicQuizTotal` (`packages/core/src/probe-session/quiz-size.ts`, new) | `gapCount: number`, `floor: number` | `number` — proportional target, floored, uncapped | SCENARIO 8 |
| `extractUrls` (`packages/core/src/probe-session/option-explanations.ts`, new) | `text: string` | `string[]` — every absolute http(s) URL found in the text; caller-side rule (not baked into this pure function) is to only ever call it on real fetched/pasted document text (`llms_txt`/`link`/`text`-kind `fetchedText`), never on model-generated search prose (`web_research`-kind `fetchedText`, or a live web-search call's own prose) — see architecture.md | SCENARIO 2, 3, 6 |
| `sanitizeCitationUrl` (same file) | `url: string \| null`, `knownUrls: string[]` | `string \| null` — `url` if present in `knownUrls`, else `null` | SCENARIO 2, 3 |
| `sanitizeOptionExplanations` (same file) | `explanations: OptionExplanation[]`, `knownUrls: string[]` | `OptionExplanation[]` — each entry's `citationUrl` run through `sanitizeCitationUrl` | SCENARIO 2, 3, 6 |
| `alignOptionExplanations` (same file) | `options: string[]`, `explanations: OptionExplanation[]` | `OptionExplanation[]` — padded/truncated to `options.length` | SCENARIO 1, 9 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `packages/shared/src/probe-session.ts` (`optionExplanations` on DTO + result schema), `apps/api/src/probe-session/probe-session.map.ts` (`alignOptionExplanations` call), `apps/api/src/probe-session/probe-session.repo.ts` (thread through) | `apps/web/src/curriculum/probe-session-quiz.tsx` — render per-option explanation after answering | None |
| SCENARIO 2 | `apps/api/src/curriculum/curriculum.repo.ts` (`getCurriculumCitableUrls`), `apps/api/src/probe/probe-grounding.ts` (`citations` in return shape), `apps/api/src/probe-session/probe-session.generate.ts` (prompt allowlist), `apps/api/src/mastra/probe-quiz.agent.ts` (citation instructions) | `probe-session-quiz.tsx` — render citation link, clickable | None |
| SCENARIO 3 | `packages/core/src/probe-session/option-explanations.ts` (`sanitizeCitationUrl`/`sanitizeOptionExplanations`), `apps/api/src/probe-session/probe-session.generate.ts` (post-generation sanitize call) | None — invisible to the learner by design | None |
| SCENARIO 4 | `packages/core/src/probe-session/shuffle.ts` (`reindexParallelArray`), `apps/api/src/probe-session/probe-session.map.ts` (apply same permutation to both arrays) | None | None |
| SCENARIO 5 | `apps/api/src/probe-session/probe-session.repo.ts` (`rowToSessionQuestion` — gate `optionExplanations` on `outcome !== null`) | `probe-session-quiz.tsx` — no explanation UI rendered pre-answer (nothing to render, DTO field is `null`) | None |
| SCENARIO 6 | `apps/api/src/probe/probe-grounding.ts` (empty-grounding fallback unchanged), `packages/core/src/probe-session/option-explanations.ts` (`sanitizeOptionExplanations` against an empty `knownUrls` array nulls every citation) | `probe-session-quiz.tsx` — explanation renders without a link when `citationUrl` is `null` | None |
| SCENARIO 7 | `apps/api/src/probe-session/probe-session.controller.ts` — verified unchanged, `handleActiveProbeSession`/`handlePrepareProbeSession` already exist and already support this exact check-then-generate flow | `apps/web/src/curriculum/probe-session-quiz.tsx` — empty-state + button, `apps/web/src/curriculum/probe-session.api.ts` (sibling's new file — wraps both existing endpoints) | None |
| SCENARIO 8 | `apps/api/src/probe-session/probe-session.generate.ts` (`targetTotal` rewired to `scaleTopicQuizTotal`, `MAX_TOTAL` removed), `packages/core/src/probe-session/quiz-size.ts` (new) | None | None |
| SCENARIO 9 | `apps/api/src/probe-session/probe-session.repo.ts` (`rowToSessionQuestion` tolerates `null` column), `packages/shared/src/probe-session.ts` (`optionExplanations` nullable throughout) | `probe-session-quiz.tsx` — renders "no explanation available" gracefully, does not crash | None |

### Files to create

```
packages/core/src/probe-session/
  quiz-size.ts              — scaleTopicQuizTotal
  quiz-size.test.ts
  option-explanations.ts    — extractUrls, sanitizeCitationUrl, sanitizeOptionExplanations,
                                alignOptionExplanations
  option-explanations.test.ts
```

### Files to modify

```
packages/shared/src/
  probe-session.ts   — + optionExplanationSchema ({ text: string, citationUrl: string|null })
                        generatedProbeQuestionSchema: + optionExplanations (array, one per option)
                        probeSessionQuestionSchema (DTO): + optionExplanations (nullable array)
                        answerProbeSessionResultSchema: + optionExplanations (nullable array,
                          nullable specifically so legacy pre-migration rows don't break this schema)

packages/core/src/probe-session/
  shuffle.ts         — + reindexParallelArray (generic, alongside sibling's reindexOptions;
                        does NOT modify reindexOptions's existing signature or tests)
  shuffle.test.ts    — + tests for reindexParallelArray

apps/api/src/
  db/schema.ts                              — probeSessionQuestions: + optionExplanations
                                                (jsonb, nullable) — separate follow-up migration,
                                                see architecture.md's sequencing note
  curriculum/curriculum.repo.ts             — + getCurriculumCitableUrls(curriculumId): reads
                                                existing sources rows (getCurriculumSourceRows);
                                                returns the union of (a) every row's value field
                                                that parses as an absolute http(s) URL, any kind,
                                                and (b) extractUrls run over fetchedText, but ONLY
                                                for rows whose kind is llms_txt/link/text —
                                                explicitly EXCLUDING web_research-kind rows, whose
                                                fetchedText is model-generated search prose, not a
                                                fetched document (see architecture.md); deduped
  probe/probe-grounding.ts                  — ProbeGrounding.citations always populated: pasted-
                                                source branch calls getCurriculumCitableUrls;
                                                web-search branch keeps returning its existing
                                                collectCitations(annotations) output unchanged —
                                                no extractUrls call added over that branch's own
                                                prose text, for the same reason as above; no change
                                                to what triggers a live web search, only to what's
                                                returned alongside the already-fetched text
  probe-session/probe-session.generate.ts   — targetTotal: topic scope uses
                                                scaleTopicQuizTotal(gapCount, MIN_TOTAL) instead of
                                                a flat TOPIC_TARGET; module scope drops MAX_TOTAL,
                                                keeps MIN_TOTAL as a floor only; buildPrompt appends
                                                a known-URL allowlist block (each URL paired with
                                                its source row's title, via getCurriculumSourceRows,
                                                for a minimal attribution hint — see architecture.md's
                                                "no fine-grained per-claim attribution" note) + per-
                                                option explanation instructions; after agent.generate
                                                returns, run
                                                sanitizeOptionExplanations against the same
                                                knownUrls before returning the batch
  probe-session/probe-session.map.ts        — buildQuestionRows: after sibling's reindexOptions
                                                call, call alignOptionExplanations then
                                                reindexParallelArray with the SAME permutation
                                                used for options; persist optionExplanations
  probe-session/probe-session.repo.ts       — rowToSessionQuestion: optionExplanations included
                                                only when row.outcome !== null (same gate sibling
                                                adds for correctAnswerIndex(es)), null otherwise —
                                                including for legacy rows where the column itself
                                                is null
  probe-session/probe-session.service.ts    — answerProbeSession: include optionExplanations,
                                                read directly off the question row already loaded
                                                by the existing getQuestionRow call at the top of
                                                the function — no extra fetch, since
                                                optionExplanations is populated at generation/
                                                insert time and recordAnswer never touches it
  mastra/probe-quiz.agent.ts                — instructions gain: every question's per-option
                                                explanations must be grounded in the supplied
                                                material (or general knowledge if none supplied);
                                                citationUrl must be copied verbatim from the
                                                supplied known-URL allowlist or left null — never
                                                invented, never paraphrased; applied on top of the
                                                sibling's already-updated instruction set, not a
                                                parallel rewrite

apps/web/src/curriculum/
  probe-session-quiz.tsx   — (sibling's new component) + empty-state "Generate Probing
                              Questions" button when no active session exists on mount (checked
                              via existing getActiveProbeSession, no auto-generate); + per-option
                              explanation/citation rendering once outcome is revealed; + full-batch
                              loading state covering prepareProbeSession's call duration
```

**Not modified, confirmed by direct code check:** `apps/api/src/probe-session/probe-session.controller.ts` (both endpoints this plan's button needs — `handleActiveProbeSession`, `handlePrepareProbeSession` — already exist and already support check-then-generate); `apps/bot/src/**` (no bot UI change; the batch-size uncap changes what the bot's existing module-quiz command *produces*, not its UI/commands — see architecture.md); anything under `apps/api/src/curriculum/` beyond the one additive `getCurriculumCitableUrls` read; `packages/core/src/socratic/**`; multi-select scoring/shuffle *algorithm* itself (only a same-permutation parallel reindex is added, `reindexOptions` itself is untouched).

### Data model changes

One follow-up Drizzle-generated migration (never hand-written, generated only after `topic-study-experience`'s migration has already landed — see architecture.md), adding one nullable column to the existing `probe_session_questions` table:

```
option_explanations   jsonb ({ text: string; citationUrl: string | null }[])   nullable, default null
```

### Documentation changes

`topic-study-experience`'s spec commits to publishing `docs/architecture/topic-study-experience.md` during its own implementation — and per this plan's hard prerequisite, that implementation completes before this plan's does. At implementation time: if `docs/architecture/topic-study-experience.md` exists (expected), extend it with a new subsection covering grounding-based citation validation and the uncapped batch sizing, rather than publishing a separate top-level doc — this is a direct extension of that same architecture, not a new one. If for any reason it's still missing, fall back to publishing a new `docs/architecture/probe-quiz-grounded-explanations.md` using the diagram already drafted in this plan's `architecture.md`.

### Decisions made autonomously

1. **`reindexParallelArray` is a new, separate generic deriver rather than widening `reindexOptions`'s signature.** `reindexOptions(options, permutation, correctIndexes)` is the sibling plan's exact, already-specified deriver contract. Changing its signature risks colliding with an implementation already in flight in another worktree. A same-permutation sibling function achieves identical correctness (explanations follow their option through the shuffle) without touching a function this plan doesn't own the contract of.
2. **Citation validation is fail-closed per option, not per question.** A single fabricated URL only nulls that one field; the explanation text and the rest of the question persist. Rejecting the whole question over one bad citation would waste a real (now larger, since batch size is uncapped) generation call over a fixable, partial defect.
3. **The known-URL allowlist reuses already-persisted `sources` rows (`getCurriculumSourceRows`) — no new fetch, no new persistence — but is built strictly by provenance, never by regex-scraping model-generated prose.** An early draft of this plan proposed running `extractUrls` over the entire flattened `gatherProbeGrounding` text, which would have included `web_research`-kind rows' `fetchedText` — and that field is `gatherTechResearchGrounding`'s model-*written* search summary, not a fetched document. Extracting "URLs" out of prose the model itself typed would trust exactly the kind of unverified claim this feature exists to distrust — a real hole caught during a pre-handoff review, not a hypothetical. Fixed: `getCurriculumCitableUrls` only regex-extracts from `fetchedText` for `llms_txt`/`link`/`text`-kind rows (genuine fetched-or-pasted document content); `web_research`-kind rows contribute only their own `value` field (still a real URL, just not text-mined further). The live web-search fallback branch similarly never runs `extractUrls` over its own generated prose — it reuses the `citations` array already collected from OpenRouter's structural `url_citation` annotations, a separately-verified channel.
4. **`citations` arrays that `tech-research-grounding.ts` and `probe-grounding.ts` already collect from OpenRouter's search annotations, but currently discard, are now threaded through instead of silently dropped — as the *only* citation signal for the live web-search fallback branch, not supplemented by text-mining that branch's own prose.** This was a genuine pre-existing gap found while tracing the grounding path (not new scope) — those URLs are real, structurally verified by the search API itself, already paid for by the existing web-search call, and were simply never used for anything.
5. **Batch-size uncap applies to both topic and module scope, even though today only the topic-page UI (this plan's actual button) is topic-scoped.** Module-scope quizzes are bot-only today (verified — no module-scope entry point exists anywhere in `apps/web`). Removing `MAX_TOTAL` therefore also uncaps the bot's existing module quiz size as a side effect. Accepted and logged rather than gating the fix web-side only: the same shared generation code and the same principle ("as many as needed," not an arbitrary flat number) apply regardless of caller, and the sibling plan already established the precedent of accepting shared-instruction side effects on the bot/`today.tsx` (see its decision #13) rather than forking behavior per caller for no functional reason.
6. **`optionExplanations` is nullable everywhere in the DTO/result schemas, including in the immediate answer response**, specifically to tolerate rows created before this plan's migration lands. A non-nullable field would force either a backfill (not requested, not needed — old questions remain answerable, just without explanations) or a runtime crash on old data.
7. **Explanations are added to `answerProbeSessionResultSchema` directly (not left to a follow-up `GET`/reload)** so the learner sees "why" in the same interaction as submitting — matches the task's explicit "I should immediately see whether they are right or not" framing, extended to the explanation text.
8. **The known-URL allowlist is paired with each row's `title` for a minimal attribution hint, rather than restructuring the shared grounding-text assembly to interleave URL markers inline.** `getCurriculumGroundingText` (reused as-is, out of scope to change) concatenates fetched bodies with no per-row attribution. Rebuilding that shared function to inject markers would touch curriculum-pipeline internals other consumers (`socratic.service.ts`, the old `probe.service.ts`) also rely on — out of this plan's scope boundary. Pairing each allowlist URL with its title, built independently in `probe-session.generate.ts` from the already-available `getCurriculumSourceRows`, gets most of the benefit (the agent can match "Temporal docs" to a Temporal-flavored claim) without touching shared code. Accepted as a minor, logged limitation for curricula with many source rows — see architecture.md.
9. **A pre-existing minor gap is fixed in passing, not as new scope:** `alignOptionExplanations`'s defensive pad/truncate mirrors the exact pattern `probe-session.map.ts` already uses for a malformed `correctAnswerIndex` — same category of "LLM structured output didn't quite match," same fix shape, directly adjacent to the file already being touched.

### Implementation order

0. Confirm `topic-study-experience` has merged (or branch is stacked on it) — hard prerequisite, not a numbered deliverable.
1. `/tdd scaleTopicQuizTotal` — covers SCENARIO 8
2. `/tdd extractUrls` + `sanitizeCitationUrl` + `sanitizeOptionExplanations` + `alignOptionExplanations` — covers SCENARIO 1, 2, 3, 6, 9
3. `/tdd reindexParallelArray` — covers SCENARIO 4
4. `packages/shared` schema changes (`probe-session.ts`)
5. `apps/api/src/db/schema.ts` — add `option_explanations`, generate + apply the follow-up Drizzle migration
6. `curriculum.repo.ts` — `getCurriculumCitableUrls`
7. `probe/probe-grounding.ts` — thread `citations` through for the pasted-source branch too
8. `probe-session.generate.ts` — allowlist in prompt, uncapped/scaled sizing, post-generation sanitize call
9. `probe-session.map.ts` — `alignOptionExplanations` + `reindexParallelArray` alongside `reindexOptions`
10. `probe-session.repo.ts` + `probe-session.service.ts` — reveal gate + result threading
11. `mastra/probe-quiz.agent.ts` — grounded-explanation + citation instructions, layered on the sibling's instruction set
12. Frontend: `probe-session-quiz.tsx` — empty-state button, per-option explanation/citation rendering
13. Documentation — extend `docs/architecture/topic-study-experience.md` (or publish the fallback, per Documentation changes above)

### Scope boundary

Out of scope: curriculum creation/research pipeline structure (reading `sources` only, never writing new kinds or fetch logic); Socratic mode, multi-select scoring, and the shuffle *algorithm* itself (only a same-permutation parallel array reindex is added); any new Telegram bot UI (the batch-size uncap changes bot output size, not bot UI/commands, and is logged as an accepted side effect, not new bot scope); persisting the chosen grounding source per question; any weighted/partial-credit scoring change; any change to how `sources` rows are created, fetched, or their `kind` enum.
