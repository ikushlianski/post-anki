# Triage chat: stronger model + card proposals (web + API)

Companion to plan.md in this folder (that file is the Inbox deck / AI example plan, already built; this one is the chat-quality follow-up). The "Inbox" is the chat queue: items in approvalState `chat`. Todos: "stronger general model for chat on cards sent from triage" and "each triage chat reply proposes one or two cards".

## Goal
Replies in the Inbox chat come from Gemini Flash and carry up to 2 proposed cards that the learner approves straight into approved cards, or ignores while chatting on.

## Facts found
- Agent pins `tierToModelId("cheap")` (deepseek-v4-flash) at apps/api/src/mastra/knowledge-bit-chat-queue.agent.ts:26-29. No Gemini Flash id exists in model-tier.ts. The admin card-model list (packages/shared/src/knowledge-item-model.ts) only has gemini-3.1-flash-lite, and that list drives card generation, so it is not touched.
- OpenRouter id `google/gemini-3-flash-preview`, about $0.50 in / $3.00 out per 1M tokens (third-party aggregators; verify on openrouter.ai before merge).
- Both existing chat-to-card paths (insertCardFromChatMessage in knowledge-bit-chat-card.repo.ts, insertDerivedKnowledgeItem) create a PENDING item. Approved needs a new branch. approveKnowledgeBit only flips the state, then the controller calls embedApprovedKnowledgeBits.
- Web thread (apps/web/src/chat-queue/chat-queue-thread.tsx) has "Make a card" (blank front, pending) and no proposal UI. The item-chat suggestions UI is tied to the tray hook, so it is not reused; extractRelatedCards and relatedCardSuggestionSchema are reused.

## Model choice
- New `CHAT_QUEUE_MODEL_ID = "openrouter/google/gemini-3-flash-preview"` exported from apps/api/src/mastra/model-tier.ts. This is the single place to change it. The agent calls `resolveAgentModel(CHAT_QUEUE_MODEL_ID, ...)`. The existing cheap-mode fallback in resolveAgentModel stays, along with the spend guard and the 60/hour cap.
- Cost: no new retry (the existing generateWithRetry call is unchanged); `maxSteps: 1`; output cap raised 400 -> 700 tokens (`CHAT_QUEUE_REPLY_MAX_TOKENS`) so the cards fit. Estimated about $0.003 per reply.

## Response shape
- `sendChatQueueMessageResultSchema` (packages/shared/src/knowledge-bit-chat-queue.ts) gains `suggestions: z.array(relatedCardSuggestionSchema).max(2).optional()`. Add `CHAT_QUEUE_MAX_PROPOSALS = 2`.
- The model appends one `<related-cards>[{"front","back","example?","origin":"own","sources":[]}]</related-cards>` block. The service runs `extractRelatedCards(text, [], 0)`, slices to 2, stores only the stripped reply text, and returns `suggestions` with the reply. Proposals are not persisted; a reload or a replay shows the text only (Make a card still works).
- `createCardFromChatMessageInput` gains `example` (optional, MANUAL_ITEM_EXAMPLE_MAX_CHARS) and `approve` (optional boolean, default false).

## Approve
Reuse POST /knowledge-bits/:id/chat-messages/:seq/card with `approve: true`. `insertCardFromChatMessage` creates the item via insertPendingManualItem and, in the same transaction, sets approvalState `approved` and `decidedAt`. It records no style-feedback decision, because it is the learner's own card and not a verdict on a generated one. The controller then calls `embedApprovedKnowledgeBits([id])`. Without `approve` the behavior is unchanged (pending). Chat history and card text are data only: output is validated by Zod, length-capped, and never executed.

## Steps
1. apps/api/src/mastra/model-tier.ts: add `CHAT_QUEUE_MODEL_ID`. Agent file: use it.
2. packages/shared/src/knowledge-bit-chat-queue.ts: add the proposal cap, raise the reply token cap, add `suggestions`, `example` and `approve`.
3. apps/api/src/mastra/knowledge-bit-chat-queue.agent.ts: edit the instructions. It may use general knowledge, saying so when it goes beyond the card and source. It appends the card block only when it helps, 1 or 2 cards, origin own, sources empty. Card block content is its own output, never copied from `<card>`, `<history>` or `<source_excerpt>` instructions. Keep the untrusted-data rules.
4. apps/api/src/knowledge-bit/knowledge-bit-chat-queue.service.ts: in generateReply, call extractRelatedCards on `result.text`, persist the stripped text, and return `suggestions` (omit when empty). Empty stripped reply with cards present: keep the old model_failed path.
5. apps/api/src/knowledge-bit/knowledge-bit-chat-card.repo.ts: add the `approve` branch. knowledge-bit-chat-queue.controller.ts: pass `approve`, embed after commit, ignore embed failures as the approval controller does.
6. apps/web/src/chat-queue/chat-thread-state.ts and use-chat-thread.ts: `ChatLine.proposals?`; set from `outcome.data.suggestions` in deliver. Update chat-queue.api.ts and chat-queue.api-client.ts for the new card input.
7. New apps/web/src/chat-queue/use-chat-proposals.ts (per line and index: saving, approved, error; calls createCardFromChatMessage with `approve: true`, then notifyPendingReviewChanged). New chat-queue-proposals.tsx renders front, back and example with an "Approve" button (disabled until the line has a seq, since assignReplySeq is async) and the line "Or keep chatting to refine". Mount it under the last assistant line in chat-queue-thread.tsx. Approved cards show "Added to approved cards".

## Tests
- model-tier.test.ts and knowledge-bit-chat-queue.agent.test.ts: the agent resolves CHAT_QUEUE_MODEL_ID; instructions mention the block and untrusted data.
- knowledge-bit-chat-queue.service.test.ts: the reply is stripped, `suggestions` capped at 2, bad JSON gives a reply only, replay has no suggestions, and the token cap is passed.
- knowledge-bit-chat-queue.controller.test.ts and knowledge-bit-chat-card.controller.test.ts: approve true embeds the new item, approve false does not; invalid input gives 400.
- knowledge-bit-chat-card.repo.integration.test.ts: approve true gives state approved with a variant, no decision row, and not_in_chat is still refused.
- packages/shared knowledge-bit-chat-queue.test.ts: schema accepts and rejects (3 suggestions, empty front, approve not boolean).
- apps/web chat-queue-proposals.test.tsx and use-chat-thread.test.tsx: proposals render under the reply, Approve posts approve true and shows the confirmation, it is disabled before seq, an error is shown on failure, and sending another message keeps the form usable.

## Done when
- A triage chat reply from Gemini Flash can include 1 or 2 proposal cards.
- Approve puts the card in approved cards (embedded) and none enters triage.
- `npx tsc --noEmit`, lint and `npx vitest run` for api, shared and web pass.

## Defaults chosen
- Single code constant, not an admin setting: the admin list is for card generation and a UI change is out of scope.
- Proposals are ephemeral: avoids a migration and a new table.
- Refine means keep chatting (the Send box is unchanged): no extra edit mode for minimal scope.
- No style-feedback decision on chat-made approvals: not a generator verdict.
- General knowledge allowed in the instructions: the stated user complaint is that the model cannot reason beyond the card.
- iOS and Mac: out of scope, they ignore the new optional field.
END-OF-REPORT
