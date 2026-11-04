---
type: spec
branch: learn-from-doc-site
task: Add knowledge subject check
complexity: medium
state: confirmed
updated: 2026-10-25
---
# Spec: Add knowledge subject check

### Summary
When the owner presses Add knowledge without a subject, the app asks a small cheap model where the text belongs and shows up to three existing subjects (or a proposal for a new one) with a reason. The owner taps to accept, picks another, or adds unfiled; nothing is ever filed automatically, and any AI failure just means the text is added unfiled with a notice. It happens before saving because the subject decides which extraction style is used.

### The ask
"If during Add Knowledge the subject is not determined, AI needs to double-check and make recommendations."

### Overlap with prior plans
- `.planning/add-knowledge-redesign/plan-1.md`: layout, per-block failure reasons, subject/model row. It has no AI advice; this plan only adds a panel and a pre-save step to the same form.
- `.planning/prose-knowledge-fisher--place-knowledge-bits/`: places already-extracted bits into topics, not subjects. Not reused beyond its prompt-safety pattern.
- `.planning/sub-subjects/plan.md`: leaf-only assignment and subject path labels. Reused as is.
- Background new-subject suggestions from clusters of unfiled bits (`apps/api/src/subject-suggestion/`) stay as the later, after-the-fact path. Its name/reason sanitizers are reused.

### Facts (cited) and Assumptions
Facts:
- A blank subject is stored as null (`apps/api/src/knowledge-source/knowledge-source.controller.ts:58`, `apps/api/src/db/schema.ts:1140`) and resolves to the general kind (`apps/api/src/subject/subject-kind.ts:33`).
- Extraction reads the source's subject for kind, learning intent and style notes at extraction time (`apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts:248`), so the subject must be known before saving.
- Only leaf subjects may be assigned (`apps/api/src/subject/subject-leaf.ts:11`); the picker hides parents unless "allow parents" is on (`apps/web/src/knowledge-source/use-knowledge-subject-choice.ts:40`).
- The form sends one subject for all blocks (`apps/web/src/knowledge-source/add-knowledge-form.tsx:84`) and is 281 lines, so wiring needs an extraction first.
- Duplicate detection is scoped to the chosen subject (`apps/api/src/knowledge-source/knowledge-source.controller.ts:251`).
- The placer pattern: cheap tier, no tools, `<bit>` tags with escaping, Zod-validated structured output, id re-check (`apps/api/src/mastra/knowledge-bit-placer.agent.ts:11`, `apps/api/src/knowledge-bit/knowledge-bit-placement.orchestrator.ts:49`).
- `generateWithRetry` checks the daily budget and records spend and a call-log row (`apps/api/src/mastra/generate-with-retry.ts:96`); `recordGenerateCall` does the same recording without retries (`:161`).
- A bit's effective subject is its curriculum's subject, else its source's (`apps/api/src/knowledge-bit/knowledge-bit-subject.ts:5`).
- Sanitizers for proposed names and reasons exist (`apps/api/src/subject-suggestion/subject-suggestion-text.ts:9`).
- No request rate limiter exists in the API (grep for 429/rate limit found only inngest config).
Assumptions:
- Mastra `generate` accepts an output-token limit option; verify before relying on it (fallback: trim the prompt only).
- The API is single-owner, so an hourly cap of 30 checks is generous.
- Subjects without a stored embedding are fewer than 15 in practice; the shortlist falls back to listing them.

### Design
- Trigger: Subject blank at submit and not dismissed for this text. A leaf preselected or picked means no check. A preselected parent with nothing picked limits candidates to its leaves.
- Input: first 1,500 characters of each text block, max 5 blocks, 4,000 total; URL blocks contribute the URL only (no fetch). One call per press.
- Candidates: all assignable leaves when 15 or fewer, otherwise the 15 nearest by stored subject embedding (one embedding of the excerpt) plus leaves lacking embeddings up to the cap. Each carries path name, description (120 chars), derived kind and up to 2 sample card statements (100 chars) from its approved bits. Non-leaf parents are listed by name only, as possible homes for a new subject.
- Aliases: the model sees S1..Sn, never real ids; unknown aliases are dropped.
- Output (Zod): up to 3 recommendations {alias, confidence high|medium|low, reason}; optional newSubject {name, parent alias or null, kindHint business|language|other, reason}. Validator: dedupe, sort by confidence, sanitize name/reason, reject names equal to an existing sibling, force business hints under the Business root (or top-level "Business" when absent), language hints become a language subject. newSubject is dropped when a high recommendation exists.
- Response: ok | none | unavailable(reason). Unavailable and none never block the save.
- UI: panel above the submit row, rows with "Use this subject", plus "Pick another" and "Add without a subject"; a new-subject row "Create and add". The primary style applies only to a high row. Dismissal is remembered until a block is edited.
- Cost: cheap tier, fast-fail with no retries, 12 s timeout, about 2,000 input tokens, output capped near 300 tokens, existing daily budget guard, hourly cap of 30 counted from the call log, server switch to disable.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|-------------------|
| shortlistCandidates | excerpt embedding, leaf subjects, cap | ordered candidate subjects | 1, 2, 5, 9 |
| buildCheckPrompt | excerpts, candidates | prompt with aliases and escaped text | 8, 9 |
| validateAdvice | model output, candidates, existing subjects | cleaned recommendations and proposal or none | 1, 2, 3, 8 |
| placeNewSubject | kindHint, parent alias, root subjects | parent id and subject kind to create | 3, 7 |
| decideCheckNeed | chosen id, preselected id, dismissal, block edits | check or skip | 5, 6 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|----------------|----------------------|
| 1 | knowledge-source subject-check orchestrator, validator, controller, candidates | subject-check panel, hook, form wiring | None |
| 2 | validator | panel | None |
| 3 | validator (placeNewSubject) | panel create row, existing createSubject server fn | None |
| 4 | orchestrator (timeout, caps, switch), call-log count | hook (unavailable path), form notice | None |
| 5 | None | hook (decideCheckNeed), candidate scoping by parent | None |
| 6 | None | hook dismissal state | None |
| 7 | None (existing dispatch) | None | None |
| 8 | agent prompt, validator | panel (plain-text rendering) | None |
| 9 | orchestrator, call-log count | None | None |

### Files to create
```
packages/shared/src/knowledge-source-subject-check.ts (+ .test.ts)  request/response schemas
apps/api/src/mastra/knowledge-source-subject-checker.agent.ts (+ .test.ts)
apps/api/src/knowledge-source/knowledge-source-subject-check.config.ts
apps/api/src/knowledge-source/knowledge-source-subject-check.candidates.ts (+ .test.ts)
apps/api/src/knowledge-source/knowledge-source-subject-check.candidates.repo.ts
apps/api/src/knowledge-source/knowledge-source-subject-check.validate.ts (+ .test.ts)
apps/api/src/knowledge-source/knowledge-source-subject-check.orchestrator.ts (+ .test.ts)
apps/api/src/knowledge-source/knowledge-source-subject-check.controller.ts (+ .test.ts)
apps/web/src/knowledge-source/use-subject-check.ts (+ .test.ts)
apps/web/src/knowledge-source/subject-check-panel.tsx (+ .test.tsx)
apps/web/src/knowledge-source/knowledge-block-list.tsx  extracted block rendering
```

### Files to modify
```
packages/shared/src/index.ts  export new schemas
apps/api/src/mastra/mastra.ts  register agent and key
apps/api/src/router-table.ts, router.ts  POST /knowledge-sources/subject-checks
apps/api/src/llm-call-events/llm-call-events.repo.ts  count recent events by op
apps/web/src/curriculum/api-client.ts, apps/web/src/knowledge-source/knowledge-source.api.ts  check call
apps/web/src/knowledge-source/add-knowledge-form.tsx  pre-save step, notice; must stay under 300 lines
apps/api/src/knowledge-bit/ingestion-pipeline.md  add the pre-save subject check step
```
Must not change: save endpoints, extraction, subject-kind dispatch, move tool.

### Risk & rollout
- Existing form tests submit with no subject; the check call must resolve to "none" or fail soft so they pass unchanged, and the new server function is mocked in them.
- Pre-save latency of up to 12 s on a blank-subject press; mitigated by the timeout and a visible "Checking subject" state.
- Standard deploy; set the switch off to restore today's behavior.

### Seed data
| Scenario | Realistic data needed | Source |
|----------|----------------------|--------|
| 1-3, 7 | 6-8 leaf subjects with descriptions, one under Business, one language, each with a few approved cards | extend dev data |

### Documentation changes
- `apps/api/src/knowledge-bit/ingestion-pipeline.md`: describe the pre-save subject check as the step before a source is created.

### Decisions made autonomously
- Check runs before saving, not after extraction, once per press: the subject drives extraction style (fact above) and re-extracting costs more than one small call.
- Check never runs on the save endpoints: extension, Notion and other callers keep deterministic behavior and no hidden cost.
- Model-reported confidence is three words, not a number: numbers from a small model are not calibrated.
- Aliases instead of real ids in the prompt: the model cannot invent or leak ids.
- New subjects are created through the existing create-subject call, only on the owner's tap; the cluster-based suggestion store is not used.
- New subjects may sit at top level or under a non-leaf parent only: creating under a leaf would move its items into a "Common" child.
- Fast-fail without retries and a 12 s timeout: the owner is waiting.
- Hourly cap counted from the existing call log: no new table and it survives restarts.
- Unavailable or none proceeds with the save unfiled plus a notice: the owner already chose a blank subject.
- Duplicate pre-check is not repeated before the AI call: a duplicate press wastes one cheap call.

### Decisions to confirm (real forks)
1. Auto-file on a high-confidence match? Recommended: no, always one tap (the owner's rule is never silent).
2. Check before saving (blocks up to 12 s) or after saving in the background? Recommended: before, because of extraction style.
3. URL blocks: URL only, skip, or fetch the page for the check? Recommended: URL only, no fetch.
4. Allow the AI to propose new subjects at all? Recommended: yes, only when no high match.

### Implementation order
1. shared-contract: schemas and tests.
2. candidate-selection: shortlist deriver, repo, tests.
3. checker-agent: prompt, schema, tests.
4. check-endpoint: validator, orchestrator, caps, route, tests.
5. web-data: api calls and decision hook.
6. form-extraction: pull block rendering out of the form.
7. recommendation-panel: panel, wiring, notice, tests.
8. docs-and-verify: pipeline doc, full typecheck, lint, vitest.

### Scope boundary
- Post-extraction re-check of bits and moving already-unfiled bits: cut, the existing move tool and cluster suggestions cover it.
- Remembering owner decisions to tune the prompt: cut.
- Per-block different subjects: cut, the form sends one subject.
- Settings toggle in the UI: cut, a server switch is enough.
- To verify: the output-token option on the agent call, and the live quality of 15-candidate prompts on the owner's real subjects.
