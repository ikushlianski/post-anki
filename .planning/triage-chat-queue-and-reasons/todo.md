---
type: todo
state: draft
---

# Todo

Order: A -> (B, C, D, G-api in parallel) -> H -> (E, F, I in parallel) -> J. Each area owns disjoint files; no two parallel areas edit the same file.

## A. Shared contracts and schema
### Goal
One agreed vocabulary: reasons (selectable/legacy/combined), `chat` state, chat schemas + caps, nothing-extracted outcome; migrations M1-M3 generated.
### Criteria
- Combined reason list parses every old and new code; selectable list has 7 codes; labels cover all.
- Schemas exported for API/web; caps are constants.
- M1-M3 generated via drizzle, applied via migrate script, migration integration test updated.
### Notes
- Owns: `packages/shared/src` (reasons, knowledge-bit state, chat queue, extraction outcome), `apps/api/src/db/schema.ts`, migrations + journal.
- Depends on: `0120_card_dedup_flags` landed first.

## B. API chat queue and thread
### Goal
Move/return/list Chat queue, persisted capped chat with cheap no-tool agent, resolve via approve/reject.
### Criteria
- Caps, idempotency, in-flight lock, budget fail-fast enforced server-side with tests.
- Injection test: hostile card text cannot change state or leak prompt.
- Delete/cleanup paths remove messages; widened source states for approve/reject/example; old chat route still refuses `chat`.
### Notes
- Owns: new `apps/api/src/knowledge-bit/knowledge-bit-chat-queue*`, new chat-queue agent in `apps/api/src/mastra`, `agent-purpose.ts`, route wiring in `api-server.ts`, state-widening in approval/delete/cleanup repos.
- Depends on: A.

## C. API extraction may return nothing
### Goal
Prompts and schemas allow zero lessons; deliberate empty recorded and surfaced; thin valid notes still yield a card.
### Criteria
- Lessons schema allows empty (+ reason); business prompt no longer forbids empty; language path unchanged.
- Deliberate empty not retried, no cards-agent call; invalid output still retried/failing as today.
- Attention/progress APIs expose "nothing extracted" distinct from failed/empty_result; eval fixtures (valuable short note, filler text) pass.
### Notes
- Owns: `apps/api/src/mastra/knowledge-bit-lessons.agent.ts`, `knowledge-bit-source-items.agent.ts`, `knowledge-bit-business-cards*`, `detect-knowledge-bits.orchestrator.ts`, source attention repo, `ingestion-pipeline.md`.
- Depends on: A (marker column, wording constant).

## D. Reject reasons: API, web, docs
### Goal
Every non-iOS consumer uses selectable list for pickers and combined list for parsing; prompts learn the new reasons.
### Criteria
- Decision repo keeps old rows' reasons; feedback block + distiller render new labels.
- Web pickers show the selectable set; admin by-model shows legacy labels; tests/fixtures updated.
- `review-feedback.md` updated; extraction prompts get one-line quality hints for the three new reasons.
### Notes
- Owns: `apps/api/src/card-triage/*`, `apps/api/src/knowledge-bit/knowledge-bit-feedback*`, `knowledge-bit-review-feedback-block*`, `card-style-notes-distiller` agent, `apps/web/src/card-triage`, `apps/web/src/knowledge-bit` reason components, `docs/architecture/knowledge-bit/review-feedback.md`.
- Depends on: A.

## G. Web: nothing-extracted message
### Goal
Add knowledge progress and triage attention show the plain "nothing worth a card" message with Retry anyway / Dismiss.
### Criteria
- Not styled as error; counts exclude it from needs-attention badge unless user retries.
### Notes
- Owns: `apps/web/src/knowledge-source/added-note-progress*`, web attention notice components.
- Depends on: C contract.

## H. iOS API client layer
### Goal
Swift models + client calls for chat queue/thread, new reasons (enum split, safe unknown decode), nothing-extracted state.
### Criteria
- Contract tests + fixtures for every new endpoint and reason code; legacy codes still decode.
### Notes
- Owns: `apps/ios/Packages/PostAnkiAPI` (APIClient additions, models, tests, fixtures) - only area allowed to edit it.
- Depends on: A, B and C contracts (not their code).

## E. iOS triage UI
### Goal
Swipe up = Chat, icons on overlays, AI example as button only, end screen removed, decision list emphasises non-accepted, auto-finish.
### Criteria
- Vertical rules: up=Chat, down=Inbox, edge gating retained; undo works for Chat.
- Done/confirm/result views and finish phases deleted; leaving list finishes session after flushing edits; failure recovers on next launch.
- List order Rejected, Chat, Inbox, then collapsed Accepted; unit + smoke tests updated.
### Notes
- Owns: `apps/ios/Sources/Shared/focus-triage-*.swift`, `apps/ios/Tests/PostAnkiMacSmokeTests/focus-triage-*`.
- Depends on: H.

## F. iOS Chat queue and chat screen
### Goal
Chat queue entry in Knowledge area, persisted chat screen with turns left, starter chips, Accept/Reject(+reasons)/Back actions.
### Criteria
- Handles cap, budget-paused, offline, in-flight states with plain wording; plain-text replies.
- Count badge matches server; resolve updates queue.
### Notes
- Owns: new `apps/ios/Sources/Shared/chat-queue-*.swift`, tab/entry wiring file for Knowledge area.
- Depends on: H.

## I. iOS reasons and nothing-extracted surfaces
### Goal
Reason chips use selectable list; attention/progress shows nothing-extracted message.
### Criteria
- Picker shows 7 reasons; legacy labels still render in lists.
### Notes
- Owns: `apps/ios/Sources/Shared/knowledge-source-attention*` consumers, reason chip views outside focus-triage-* (shared chip component if extracted).
- Depends on: H.

## J. Verification
### Goal
Whole flow green.
### Criteria
- `npx tsc --noEmit`, lint, `npx vitest run` zero issues; `swift build`/`swift test` pass; dev Mac build relaunched via `native` dev-copy command for the user; manual pass of S1-S11.
### Notes
- Owns: none (read-only run).
- Depends on: all.
