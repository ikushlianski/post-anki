# Spec: chat scoped to a single knowledge item

## The ask
Add `POST /knowledge-bits/:id/chat`, a stateless Q&A chat grounded on one knowledge item's own
content, mirroring `qa-chat`'s shape.

## What to do
1. Add `getKnowledgeBitById` to `knowledge-bit.repo.ts`.
2. Add request/response Zod schemas to `packages/shared/src/knowledge-bit-chat.ts`, reusing
   `chatMessageSchema`.
3. Add a Mastra agent whose instructions restrict it to the bit's own `body` text only.
4. Add a service that fetches the bit (404 if missing), builds the prompt, calls
   `generateWithRetry`.
5. Add a controller parsing `:id` + the request body, dispatching to the service, sending
   `{reply}` or the 404 error shape.
6. Register the route in `router-table.ts` + `server.ts`'s switch.

## Files by scenario

| Scenario | Files |
|---|---|
| Grounded reply for an existing bit | `knowledge-bit-chat.service.ts`, `knowledge-bit-chat.agent.ts`, `knowledge-bit.repo.ts` |
| Transcript included in prompt | `knowledge-bit-chat.service.ts` |
| 404 for a missing bit | `knowledge-bit-chat.service.ts`, `knowledge-bit-chat.controller.ts` |
| Empty message rejected | `packages/shared/src/knowledge-bit-chat.ts` (Zod `.min(1)`), `knowledge-bit-chat.controller.ts` |
| Agent instructions forbid outside knowledge | `knowledge-bit-chat.agent.ts` |
| Route resolves to the handler | `router-table.ts`, `server.ts` |

## Done when
Every scenario above has a real, passing, non-skipped test; `tsc --noEmit` and the full unit
suite are clean.
