# Card proposals in every item chat (iPhone + Mac)

## Problem
User on iPhone asks the chat "make a card that ..." and the AI says it cannot create cards.
Card proposals (proposeNewCard tool, approve/reject/reword cards) exist only in the chat-queue thread
(`POST /knowledge-bits/:id/chat-messages`, agent `apps/api/src/mastra/knowledge-bit-chat-queue.agent.ts`).
The chat the user opens from the knowledge inbox, from a review/exercise, and from the due-review sheet is
`apps/ios/Sources/Shared/KnowledgeItemChatScreen.swift`, which calls the stateless legacy
`POST /knowledge-bits/:id/chat` (`APIClient.chatWithKnowledgeBit`, agent `mastra/knowledge-bit-chat.agent.ts`) — no proposals.
Prod confirms: no chat-queue messages since the feature shipped.

## Goal
In every per-item chat on iPhone and Mac, "Make a card" button or typing "make a card that ..." produces an
inline proposed card with Approve / Reject / Reword question, same behaviour as the queue thread.

## Approach (default; deviate only with a stated reason in the report)
- Make KnowledgeItemChatScreen talk to the same persistent thread as the queue chat (load thread, send message,
  decide proposal, reword proposal — clients in `Packages/PostAnkiAPI/Sources/PostAnkiAPI/chat-queue-client.swift`)
  and reuse the existing proposal card + "Make a card" UI from the queue thread view (find it via
  `Sources/Shared/chat-queue-thread-model.swift`). Do not duplicate those views — extract/share if needed.
- Keep the screen's existing extras (Add as new knowledge, Refine into knowledge items, onReplacementSaved) working.
- Verify the server accepts chat-messages for bits in any status the screen is opened from (inbox/pending, approved,
  due review). `knowledge-bit-review-chat.integration.test.ts` suggests approved bits already work; if some status is
  refused, extend the server minimally and test it.
- If switching transports is unworkable, fall back to adding the propose tool to the legacy item chat agent and
  returning proposals in its response — but persistence of decided proposals must still work.

## Out of scope
Topic/study chat, subject chat, global card chat, web UI.

## Done when
- API unit tests touched pass (`cd apps/api && OPENROUTER_API_KEY=test-key LLM_MODE=mock npx vitest run <files> --maxWorkers=2 --minWorkers=1`), tsc clean.
- `apps/ios/scripts/run-mac.sh --test` passes, generic iOS simulator build of PostAnkiIOS succeeds.
- A test proves the item chat screen model routes "make a card" through the proposal-capable thread.
