---
type: scenarios
branch: learning-map-chat
task: Persistent sidebar study chat with cross-curriculum learning-map context + level-aware generation
state: confirmed
updated: 2026-07-15
---
# Scenarios: Learning-map sidebar chat

## Business Scenarios

SCENARIO 1: Sidebar chat is reachable from both quiz and Socratic modes on a topic page

Opening `/probe/$topicId` shows a persistent chat panel (sidebar) regardless of whether the
learner is in Quick-test or Socratic mode, so they never have to leave the topic page to ask
a free-form question.

What to verify:
- Chat panel renders on `probe.$topicId.tsx` for both modes, not gated behind one mode
- Switching modes (quiz ↔ Socratic) does not unmount/reset the chat's in-progress transcript
- Chat is visually distinct from the mode-specific quiz/Socratic surface (it is a third, always-present pane, not a tab)

Acceptance: [x]
- `apps/web/src/routes/probe.$topicId.tsx:77-96` — `StudyChatSidebar` is a sibling of the mode-ternary `<div>`, not inside it; it renders regardless of `mode`.
- `apps/web/src/routes/probe.$topicId.tsx:79-87` — only the quiz/Socratic panel is behind the `mode === 'socratic'` ternary; the sidebar at `:90-95` is outside it.
- `apps/web/src/routes/probe.$topicId.tsx:91` — `key={topic.id}` on the sidebar resets it on topic change only, never on a mode toggle (mode isn't part of the key).
- e2e: `~/work/verification-repo/projects/post-anki/post-anki/features/probe/tests/study-chat-sidebar/test.ts` — asserts `study-chat-sidebar` visible alongside `socratic-chat`, and that a sent message/reply survive a Socratic → quick-test mode switch.

SCENARIO 2: Learner clarifies a specific wrong quiz answer without leaving the quiz

After a quiz question is graded wrong, the learner can jump straight into the sidebar chat to
ask about that specific question, and the chat opens already primed with the question, the
options, and which one was correct — no retyping context.

What to verify:
- A per-question "ask about this" affordance exists on a graded (revealed) quiz question
- Triggering it seeds the chat's next message context with that question's prompt, options, and correct answer
- The learner can still type a free-form follow-up after the seed

Acceptance: [x]
- `apps/web/src/curriculum/probe-session-quiz.tsx:327-334` — `quiz-ask-about-this` button rendered only when `answered` (a graded question), calling `onAskAboutThis(buildAskAboutThisSeed(current))`.
- `apps/web/src/curriculum/probe-session-quiz.tsx:35-53` — `buildAskAboutThisSeed` builds plain text from `question.prompt`, `question.options`, and the resolved correct answer(s).
- `apps/web/src/routes/probe.$topicId.tsx:85,90-95` — `onAskAboutThis={setChatSeed}` wires the quiz's seed into the sidebar's `seed` prop.
- `apps/web/src/curriculum/study-chat-sidebar.tsx:28-33` — the seed effect calls `setDraft(seed)`, pre-filling the visible, editable input rather than auto-sending or hiding it.
- e2e: `~/work/verification-repo/projects/post-anki/post-anki/features/probe/tests/study-chat-ask-about-this/test.ts` — answers a quiz question wrong, clicks `quiz-ask-about-this`, asserts `study-chat-input` is pre-filled and still editable, then sends it.

SCENARIO 3: Chat answers reference the learner's cross-curriculum learning map

The learner is mid-way through a Vue.js curriculum having already mastered a Next.js
curriculum. Asking the chat "how does this compare to what I know" produces an answer that
draws the comparison, because the chat's context includes a summary of what the learner has
mastered elsewhere, not just the current topic.

What to verify:
- The system prompt sent to the chat agent includes a compact cross-curriculum mastery summary, not just the current topic/curriculum
- The summary is derived from existing progress data (gap coverage), not a new self-reported "I know X" field
- A learner with only one curriculum still gets a working answer — the summary degrades to "nothing else studied yet" rather than erroring

Acceptance: [x]
- `apps/api/src/study-chat/study-chat.service.ts:42-44` — fetches `getLearningMapSnapshots()`, filters out the current curriculum, and passes the rest through `summarizeLearningMap`.
- `apps/api/src/curriculum/curriculum.repo.ts:663-733` — `getLearningMapSnapshots` reuses the existing `moduleProgress`/persisted `progressStatus`/`progressMaturity` columns (topic rows), no new self-reported field.
- `packages/core/src/curriculum/learning-map.ts:56-58` — `summarizeLearningMap([])` returns `"Nothing else studied yet."` rather than throwing.
- `packages/core/src/curriculum/learning-map.test.ts:19-21` — "says nothing else studied yet when there are no other curricula".

SCENARIO 4: Chat stays grounded in the current topic and this session's exchanges

Within one open browser tab, asking a follow-up question ("what did you mean by that") gets a
coherent answer because the prior messages in this chat are included in context on each call.

What to verify:
- Client sends the accumulated transcript (this tab, this topic) with every chat call
- Reloading the page starts a fresh transcript (mirrors the already-decided Socratic-chat behavior: session-local, not server-persisted) — not a regression, a deliberate consistency choice

Acceptance: [x]
- `apps/web/src/curriculum/study-chat-sidebar.tsx:53-56` — `transcript` built from the component's own `messages` state and sent with every `mutation.mutate` call.
- `apps/web/src/curriculum/study-chat-sidebar.tsx:24` — `messages` lives in local `useState`, not a query cache or server store — a reload starts empty, same as `SocraticChat`'s identical pattern (`apps/web/src/curriculum/socratic-chat.tsx:22`).
- `apps/api/src/study-chat/study-chat.service.ts:16-24,45` — the server never persists a transcript; it only reads the client-supplied `input.transcript` for that one call.

SCENARIO 5: Medium-level generation builds on basic-level coverage instead of re-teaching it

The learner finishes all topics in a curriculum's Basic module and starts a topic in that same
curriculum's Medium module. New quiz questions and Socratic prompts for that Medium topic are
generated with awareness of which concepts were already covered at Basic, so they build on that
foundation rather than repeating introductory material.

What to verify:
- Generation prompt for a topic whose module `level` is `medium` or `advanced` includes a compact list of concept labels already `covered` in lower-level modules of the same curriculum
- A topic in a curriculum with no `level` tiers at all (module `level` is `null`) generates exactly as it does today — no behavior change
- A topic in the lowest available level for its curriculum (nothing below it) generates exactly as it does today

Acceptance: [x]
- `packages/core/src/curriculum/level-context.ts:8-27` — `priorLevelCoverageLabels` collects deduped covered labels from strictly lower-rank levels.
- `packages/core/src/curriculum/level-context.test.ts:20-26` — "collects covered labels from strictly lower-rank levels".
- `apps/api/src/probe-session/probe-session.generate.ts:90-96,114` — `priorLevelCoverageLine` appends "Already covered at a lower level: ..." to `topicBlock` only when the list is non-empty.
- `apps/api/src/probe/probe.service.ts:248-250` — the single-question prompt path (`generateQuestion`) appends the same line when `ask.priorLevelCoverage` is non-empty.
- `packages/core/src/curriculum/level-context.ts:12-14` and `apps/api/src/curriculum/curriculum.repo.ts:753-755` — `currentLevel === null` short-circuits to `[]` at both the deriver and the repo helper, so a `null`-level module's prompt is byte-identical to before (the `.filter(Boolean)` in `topicBlock`/`generateQuestion` drops the empty string).
- `packages/core/src/curriculum/level-context.test.ts:12-18` — "returns an empty list when nothing is below the current level" (lowest-tier case).

SCENARIO 6: Wrong quiz/Socratic answers correctly stay in the review pool; right answers count toward mastery

Of 10 quiz questions, 7 are answered correctly and 3 incorrectly. The 7 contribute to the
topic's mastery percentage; the 3 remain open and are what a later quiz or Socratic session on
that topic surfaces first.

What to verify:
- Confirms existing behavior (`answerProbeSession`/`answerSocraticSession` + `gapMaturity`/`deriveTopicStatus`) already satisfies this — no new deriver, no new schema
- A correct answer on an open gap flips it to `covered` and it counts toward the topic's maturity %
- A wrong answer leaves its gap `open`, and `nextGapToProbe`/`openGaps` already prioritize open gaps in future sessions
- Explicitly out of scope: demoting an already-`covered` gap back to `open` after a later wrong answer — not requested, would change today's shipped behavior (see `todo.md`)

Acceptance: [x]
- `git diff 7a98d2d -- apps/api/src/socratic apps/api/src/probe-session/probe-session.service.ts apps/bot` — 0 lines, confirmed by direct command (base commit is where this plan's implementation started, after fast-forwarding the worktree onto `main`).
- `apps/api/src/socratic/socratic.service.ts:178-179` (unmodified, pre-existing) — a covered gap flips `state: "covered"`; a wrong answer never touches `gaps` state.
- `packages/core/src/curriculum/gap.ts:66-71` (unmodified, pre-existing) — `nextGapToProbe`/`openGaps` already rank open gaps first.
- No new deriver or schema added for this scenario — verified by direct code check, not built, per `todo.md`'s logged judgment call.

SCENARIO 7: Learning-map summary stays within a fixed token budget as curricula accumulate

A learner with 15 curricula across 4 subjects opens the sidebar chat. The injected summary is
still compact (capped entry count / character budget), not a full dump of every topic and gap.

What to verify:
- Summarizer caps the number of curricula/entries included (e.g. ranked by relevance — in-progress and recently-touched first) rather than growing unbounded
- Total injected text stays under a fixed character budget documented in `architecture.md`

Acceptance: [x]
- `packages/core/src/curriculum/learning-map.ts:3-4` — `MAX_CURRICULA = 10`, `MAX_CHARS = 1200`, documented and visible next to the deriver, matching `docs/architecture/learning-map-chat.md`'s "Failure modes" section.
- `packages/core/src/curriculum/learning-map.ts:60-73` — ranks (in-progress first, then recency, then mastery), slices to `MAX_CURRICULA`, then drops trailing entries once `charCount + addedChars > MAX_CHARS` rather than truncating mid-line.
- `packages/core/src/curriculum/learning-map.test.ts:106-119` — "caps the number of curricula included at MAX_CURRICULA" (count-cap path).
- `packages/core/src/curriculum/learning-map.test.ts:138-161` — "drops the lowest-ranked entries once the char budget is exceeded within the first MAX_CURRICULA, rather than truncating mid-sentence" — uses 200-char names so it genuinely trips the char budget before the count cap, not the count-cap case again.

## Technical/Architectural Scenarios

SCENARIO 8: Chat agent call failure degrades gracefully

The chat's LLM call fails (timeout, API error) the same way `probe-grounding.ts`'s existing web
call already handles failure.

What to verify:
- A failed chat call returns a safe fallback message, not a thrown error the UI has to guess about
- No partial/duplicate transcript entries are recorded client-side on failure

Acceptance: [x]
- `apps/api/src/study-chat/study-chat.service.ts:62-74` — `agent.generate` wrapped in try/catch (same shape as `probe-grounding.ts`'s `webGround`); an empty/thrown result falls through to `{ reply: FALLBACK_REPLY }`, never a thrown error out of `askStudyChat`.
- `apps/web/src/curriculum/study-chat-sidebar.tsx:64-73` — `onSuccess` appends exactly one assistant bubble per call, using `result?.reply ?? FALLBACK_REPLY` — a client-side `null` (network failure) also degrades to one fallback bubble, never zero or two.
- `apps/web/src/curriculum/study-chat-sidebar.tsx:58-59` — the learner's own outgoing message is appended once, before the mutation resolves; nothing appends it a second time on retry/failure.

SCENARIO 9: Level-aware context lookup does not add a second round-trip to generation

The "prior lower-level coverage" lookup piggybacks on data already being fetched for a topic's
generation call (topic → module → curriculum), rather than issuing a separate blocking query
chain that measurably slows down question generation.

What to verify:
- The lower-level-coverage query is scoped to `curriculumId` + `level rank < current`, a single indexed-by-existing-columns query, not N+1 per gap

Acceptance: [x]
- `apps/api/src/curriculum/curriculum.repo.ts:757-767` — `getLowerLevelCoverage` issues one joined `gaps ⋈ topics ⋈ modules` query filtered by `modules.curriculumId` + `gaps.state = "covered"`, then groups by level in-process — one query regardless of gap count, not per-gap.
- `apps/api/src/curriculum/curriculum.repo.ts:737-755` — the two preceding lookups are single-row primary-key reads (topic row, its own module row), not a loop over gaps.
- Known tradeoff, not a regression: `getLowerLevelCoverage` itself runs once per topic in a module-scope batch (`apps/api/src/probe-session/probe-session.generate.ts:237`), same per-topic-fetch shape as the pre-existing `listGapsForTopic`/`getFeedbackForTopic` calls on the same line — still zero per-gap queries, the scenario's actual bar.
