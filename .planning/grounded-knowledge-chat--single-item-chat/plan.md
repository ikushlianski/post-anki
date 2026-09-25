# Plan: chat scoped to a single knowledge item

## Goal
Let the learner have a Q&A conversation about one specific knowledge item (not the whole
library), grounded strictly on that item's own content by default. Mirrors the existing
`qa-chat` and `global-card-chat` services, which already establish the transcript shape,
`generateWithRetry` call pattern, and 404 shape this reuses.

## Design

- New endpoint `POST /knowledge-bits/:id/chat`.
  - Request: `{ message: string, transcript?: ChatMessage[] }` — reuses the existing
    `chatMessageSchema` from `packages/shared/src/study-chat.ts`.
  - Response: `{ reply: string }`.
  - 404 `{ "error": "not_found" }` if the bit doesn't exist — same shape as qa-chat's.
- New repo function `getKnowledgeBitById(id, db = getDb())` in
  `apps/api/src/knowledge-bit/knowledge-bit.repo.ts` — doesn't exist yet (confirmed by
  research); the only prior by-id lookup is inline inside a placement transaction.
- New Mastra agent `knowledge-bit-chat.agent.ts`, instructions built from the bit's own
  `body` column only — no `allowGeneralKnowledge` flag yet (that's the next todo item in this
  direction, layered on top once this lands).
- New service `knowledge-bit-chat.service.ts` mirroring `qa-chat.service.ts`: fetch the bit,
  404 if missing, build the prompt from the bit's `body`, call `generateWithRetry("knowledge_bit_chat_reply", null, AGENT_KEYS.knowledgeBitChat, ...)`.
- New controller `knowledge-bit-chat.controller.ts` mirroring `qa-chat.controller.ts`'s
  parse/dispatch/send-error shape, parses `:id` from the route params.
- Route registered in `router-table.ts` next to the other `/knowledge-bits/...` entries,
  dispatched in `server.ts`'s switch.

## Non-goals (this unit)
- The `allowGeneralKnowledge`/web-search opt-in — separate todo item, next in this direction.
- Creating or editing a knowledge item from the chat — separate todo item, third in this
  direction, depends on this one existing.
- Persisting the transcript server-side — stateless like qa-chat, the client resends it.

## Reuse
- `chatMessageSchema` (`packages/shared/src/study-chat.ts`) — transcript shape.
- `generateWithRetry` (`apps/api/src/mastra/generate-with-retry.ts`) — retry wrapper.
- `sendError`/`sendJson` (`apps/api/src/shared/http.ts`) — response shape.
- `AGENT_KEYS` — add one new key, don't restructure the existing map.
