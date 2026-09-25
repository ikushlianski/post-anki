# Implementation report: chat scoped to a single knowledge item

## What shipped
`POST /knowledge-bits/:id/chat` — a stateless Q&A chat grounded strictly on one knowledge item's
own `body` text, mirroring `qa-chat`'s shape. No `allowGeneralKnowledge` flag (out of scope for
this unit).

## Files created

- `apps/api/src/mastra/knowledge-bit-chat.agent.ts` — new Mastra agent, no tools, instructions
  grounded on "Knowledge item: ..." only.
- `apps/api/src/knowledge-bit/knowledge-bit-chat.service.ts` — fetches the bit, 404s if missing,
  builds the prompt, calls `generateWithRetry`.
- `apps/api/src/knowledge-bit/knowledge-bit-chat.controller.ts` — parses `:id` + body, dispatches,
  sends `{reply}` or the 404 error shape.
- `packages/shared/src/knowledge-bit-chat.ts` — `askKnowledgeBitChatInput` /
  `askKnowledgeBitChatResultSchema` Zod schemas, reusing `chatMessageSchema`.
- Tests: `apps/api/src/knowledge-bit/knowledge-bit-chat.service.test.ts`,
  `apps/api/src/knowledge-bit/knowledge-bit-chat.controller.test.ts`,
  `apps/api/src/mastra/knowledge-bit-chat.agent.test.ts`.

## Files changed

- `apps/api/src/knowledge-bit/knowledge-bit.repo.ts:11-25` — added `getKnowledgeBitById`.
- `apps/api/src/mastra/mastra.ts:52,129` — added `AGENT_KEYS.knowledgeBitChat` and registered the
  new agent, without restructuring the existing map/registration list.
- `apps/api/src/router.ts:100` — added `askKnowledgeBitChat` to `RouteName`.
- `apps/api/src/router-table.ts:243-248` — registered `POST /knowledge-bits/:id/chat`, following
  the existing `/^\/...\/([^/]+)\/...$/` param-route convention already used throughout the table.
- `apps/api/src/server.ts:127-128,556-557` — imported and wired the controller into the dispatch
  switch.
- `packages/shared/src/index.ts:43-44` — exported the new `knowledge-bit-chat` module.
- `apps/api/src/router.test.ts:78-84` — added a route-resolution test.

## Scenarios and where each is proven

| Scenario | Test | File:line |
|---|---|---|
| Grounded reply for an existing bit | `grounds the reply on the knowledge item's own body` | `apps/api/src/knowledge-bit/knowledge-bit-chat.service.test.ts:39` |
| `generateWithRetry` called with the right op/agent key | `calls generateWithRetry with the knowledge-bit-chat op and agent key` | `apps/api/src/knowledge-bit/knowledge-bit-chat.service.test.ts:49` |
| Transcript included in the prompt | `includes a passed-in transcript in the prompt, ahead of the new question` | `apps/api/src/knowledge-bit/knowledge-bit-chat.service.test.ts:60` |
| 404 for a missing bit id (service shape) | `returns not_found and never calls the model when the bit does not exist` | `apps/api/src/knowledge-bit/knowledge-bit-chat.service.test.ts:79` |
| 404 for a missing bit id (HTTP status + body) | `returns 404 not_found when the service reports the bit is missing` | `apps/api/src/knowledge-bit/knowledge-bit-chat.controller.test.ts:58` |
| Empty message rejected, not sent to the model | `rejects an empty message with a 400 and never calls the service` | `apps/api/src/knowledge-bit/knowledge-bit-chat.controller.test.ts:70` |
| Controller dispatch happy path | `dispatches the parsed id and body to the service and returns the reply` | `apps/api/src/knowledge-bit/knowledge-bit-chat.controller.test.ts:45` |
| Agent instructions forbid outside knowledge | `forbids answering from outside the knowledge item's own content` / `tells the agent to say plainly when the item doesn't cover the question` | `apps/api/src/mastra/knowledge-bit-chat.agent.test.ts:5`, `:12` |
| Route resolves to the new handler | `resolves POST /knowledge-bits/:id/chat to the knowledge-bit-scoped chat handler` | `apps/api/src/router.test.ts:78` |

`server.ts`'s dispatch `case "askKnowledgeBitChat"` was verified by inspection
(`apps/api/src/server.ts:556-557`) rather than a unit test — the module calls `server.listen()` on
import, matching the existing convention that no other route-dispatch case in this file is
directly unit-tested either. `getKnowledgeBitById` itself has no dedicated repo test; it's a
5-line `select().where().limit(1)` wrapper exercised through the service test's repo mock, matching
the level of coverage this codebase gives to comparable one-off `getXById` repo functions (e.g.
`getQuestionVariantById`).

## Verification

- `cd apps/api && npx tsc --noEmit` — clean.
- `cd apps/api && npx vitest run` — 91 test files, 845 tests, all passing (includes every
  pre-existing test, not just the new ones).
- No ESLint config exists in this repo (`apps/api` has no lint script or `eslint.config.*`), so no
  lint step was run — nothing to run.

## Design notes

- The agent has no tools and takes no `requestContext`, unlike `qa-chat`/`global-card-chat` —
  there's no `allowGeneralKnowledge` toggle yet, and no curriculum/topic context to pass, so the
  agent's `instructions` are a flat string rather than a `requestContext`-resolved function.
- `askKnowledgeBitChat`'s prompt shape matches `qa-chat`'s `buildPrompt`: an optional transcript
  block (via the shared `formatTranscript` helper), then `Learner: <message>` last, keeping the
  same "grounding block, then history, then question" ordering the other chat services use.
