# Chat parity: Mac "Send to chat", first prompt, Finish/Cancel chat

Goal: Mac triage can send an item to chat, iPhone and Mac can attach a first prompt the server answers in the background, and the chat's closing button reads "Finish chat" (a card was accepted) or "Cancel chat" (deletes the chat) on iPhone, Mac and web.

## Facts found in code (verified)
- Mac chat already works: `MacChatQueueView` -> shared `ChatQueueScreen` -> `ChatQueueThreadScreen` (proposals, make-card, reword, retry). The real gap is Mac triage (`PendingReviewTriageView` + `PendingReviewTriageModel`, only Drop/Edit/Skip/Keep) has no Chat action.
- iPhone sends via `FocusTriageModel.sendToChat()` -> `APIClient.moveToChatQueue(id:)` -> `POST /knowledge-bits/:id/chat-queue`; no body today.
- Chat replies are synchronous: `sendChatQueueMessage` (service) persists user+assistant as one atomic pair (`insertChatTurn`); replay is keyed on `clientMessageId`.
- "Accept" in a chat = `accept()` -> approve item (`knowledge-bit-approval.repo.ts` sets approved and deletes the thread). Back to triage = state `chat` -> `pending`, thread kept. Web has the same Accept in `chat-queue-thread.tsx`. Review chats (state approved) show "Clear chat"; unchanged.
- Generic durable job runner exists: `dispatchBackgroundJob` + `BackgroundJob` union in `apps/api/src/background-job/` (Inngest in prod, fire-and-forget locally).

## Order and shared files
1 -> 2 -> 3. Shared: `chat-queue-thread-model.swift` (2,3), `chat-queue-thread-screen+bottom.swift` (3), `chat-queue.repo.ts` (2,3), `knowledge-bit-chat-queue-actions.controller.test.ts` (2,3), `router-table.ts`/`router.ts`/`api-server.ts` (2,3), `use-chat-thread.ts` + `chat-queue-thread.tsx` (3 only).

## Item 1: Mac triage "Send to chat"
Behaviour: Mac triage gets a Chat button and key `C`; the item leaves the triage queue, is parked in chat (no triage decision recorded, same as iPhone), Chat sidebar count +1. Chat itself needs no new work.
- API: none.
- Steps:
  1. `Sources/Shared/pending-review-triage-model+chat.swift` (new): `sendToChat(prompt: String? = nil) async -> Bool` mirroring `FocusTriageModel.moveCurrent`: guard current/!isBusy/not queued; `list.inFlight`; call `APIClient.moveToChatQueue`; on success `neighbour(of:)` successor, `list.remove`, `list.counts.adjust(-1)`, `ChatQueueCountStore.shared.adjust(1)`, `clearSelection`; on error use `InboxMoveOutcome.outcome(for:)` and `InboxMessages.message(for:doing:)` (409 blocked / 404 -> remove with notice, else `list.rowMessages`).
  2. `pending-review-triage-key-map.swift`: add `.chat` action on `c`; `PendingReviewTriageModel.perform` treats `.chat` like `.edit` (view-handled).
  3. `pending-review-triage-view.swift`: "Chat" button in bottom bar, `@State` sheet flag, key hint text updated; sheet = shared `ChatFirstPromptSheet` (created in item 2; in item 1 land the button calling `sendToChat()` directly, item 2 swaps in the sheet).
- Reuse: `InboxMoveOutcome`, `InboxMessages`, `ChatQueueCountStore`, `list.snapshot/remove`. No undo for Mac chat sends (chat's "Back to triage"/"Cancel chat" is the way back).
- Tests: `Tests/PostAnkiMacSmokeTests/mac-triage-send-to-chat-smoke-tests.swift` (moves to next card, count adjusted, no decision recorded, 409 removes with notice, failure keeps card with message); extend `PendingReviewTriageSmokeTests.swift` for key `c`.
- Risks: the `PendingDecisionQueue` offline queue is bypassed (direct call, like iPhone); fine because sends are not decisions.

## Item 2: optional first prompt, answered in background
Behaviour: Chat button on iPhone and Mac opens a small prompt sheet (text optional; empty sends plainly). With a prompt, the server answers in the background; opening the chat shows the prompt bubble and "Thinking..." until the reply lands. iPhone swipe-up stays instant with no prompt.
- Contract:
  - `POST /knowledge-bits/:id/chat-queue` accepts optional body `{ prompt?: string }` (`moveToChatQueueInput` in `packages/shared/src/knowledge-bit-chat-queue.ts`, trimmed, max `CHAT_QUEUE_MAX_MESSAGE_CHARS`; empty body already parses as `{}`).
  - `GET .../chat-messages` thread gains optional `pendingPrompt` (set only while column is non-null and thread has no messages).
  - Migration: `knowledge_bits.chat_first_prompt text null` (`db/schema.ts`, generate then run via existing migrate script).
- Server steps:
  1. `knowledge-bit-chat-queue.repo.ts`: `moveKnowledgeBitToChatQueue(id, prompt?)` stores the prompt on the pending/inbox -> chat transition and returns whether it moved; `returnKnowledgeBitFromChatQueue` nulls it.
  2. Extract the web-tools setup from `handleSendChatQueueMessage` into `knowledge-bit-chat-queue-web-tools.ts` (reused by controller and job).
  3. `background-job.events.ts` add `{ kind: "chat-first-reply"; bitId }`; `background-job.handlers.ts` case calls `answerFirstChatPrompt(bitId)` in new `knowledge-bit/chat-first-reply.orchestrator.ts` (skip if no prompt, state not `chat`, or messages exist; send with `clientMessageId = first-<bitId>`).
  4. `knowledge-bit-chat-queue.service.ts`: option `firstPrompt`; `persistTurn` nulls the column in the same transaction and, in first-prompt mode, requires state `chat` and column non-null (so a cancel, reject or manual take-over mid-generation drops the reply).
  5. Controller `handleMoveKnowledgeBitToChatQueue(req,res,id)` (api-server.ts case updated) calls `dispatchBackgroundJob` after a successful move that stored a prompt.
- Client steps:
  1. `Packages/PostAnkiAPI`: `moveToChatQueue(id:prompt:)` (JSON body only when prompt present); `ChatQueueThread.pendingPrompt: String?` in `chat-queue-models.swift`.
  2. `Sources/Shared/chat-first-prompt-sheet.swift` (new, used by iPhone and Mac): multiline field, limit `ChatQueueLimits.maxMessageChars`, buttons Send (or "Send without a prompt" when empty) / Cancel.
  3. iPhone: `FocusTriageModel.sendToChat(prompt:)`; `FocusTriageView+Bars.swift` Chat tile opens the sheet; `moveCurrent/vertical` take the prompt. Mac: wire the sheet from item 1.
  4. `chat-queue-thread-model+first-reply.swift` (new): in `load()`, pendingPrompt + no messages -> show user bubble, "Thinking..." and poll thread every 3s (max 20 tries, cancelled with the view task); on timeout move the prompt into the composer draft with a notice. Thread screen shows Thinking when `isSending || awaitsFirstReply`.
- Reuse: `dispatchBackgroundJob`, `sendChatQueueMessage` (idempotent replay, budget gate, hourly cap), `ChatQueueThreadModel` lines/draft.
- Tests: `knowledge-bit-chat-first-reply.orchestrator.test.ts` (replies once, skips when user already chatted/prompt cleared/budget paused); `knowledge-bit-chat-queue-first-prompt.service.test.ts` (column cleared on persist, stale first-prompt reply dropped); extend `knowledge-bit-chat-queue-actions.controller.test.ts` (prompt dispatches job, no prompt does not, oversize 400), `background-job.handlers.test.ts`, `packages/shared/src/knowledge-bit-chat-queue.test.ts`; integration `knowledge-bit-chat-queue-first-prompt.repo.integration.test.ts` (CI only). Swift: `PostAnkiAPITests/move-to-chat-prompt-tests.swift`, `Tests/PostAnkiMacSmokeTests/chat-queue-first-reply-smoke-tests.swift`, extend `focus-triage-chat-smoke-tests.swift`.
- Risks: model cost per send (bounded by existing hourly cap and spend guard, one job per move, no job retries because the handler swallows errors); web thread ignores `pendingPrompt` so a web user could race the job (the take-over guard covers it).

## Item 3: Finish chat / Cancel chat
Behaviour: in a triage-state chat the first button is "Finish chat" when any proposal in the thread is accepted (create or update), else "Cancel chat". Finish = today's Accept (item approved, thread removed). Cancel = item goes back to the triage queue as pending and the whole conversation is deleted. Reject, Snooze, Back to triage (keeps thread) stay. Review chats keep "Clear chat".
- Contract: new `DELETE /knowledge-bits/:id/chat-messages` (route `cancelChatQueueThread`): lock row; `chat` -> `pending`, null `chatAt`, `chatSnoozedUntil`, `chat_first_prompt`, delete messages; `pending`/`approved` -> delete messages; other states 409 `blocked`; unknown 404. No server-side accepted check (clients choose the button; cards already created are untouched). No schema change beyond item 2.
- Server steps: `cancelChatQueueKnowledgeBit` in `knowledge-bit-chat-queue.repo.ts`; handler in `knowledge-bit-chat-queue.controller.ts`; entries in `router-table.ts`, `router.ts` name union, `api-server.ts` switch.
- iOS/Mac steps (shared screen, so both):
  1. `PostAnkiAPI/chat-queue-client.swift`: `cancelChatQueueThread(id:)`.
  2. `chat-queue-thread-model.swift`: `hasAcceptedCard` (any line proposal `.accepted`) and `cancelChat()` via `resolve` + `finish(removing: true)`.
  3. `chat-queue-thread-screen+bottom.swift` `triageActions`: first button Finish (id `chat-queue-finish`, calls `accept()`) or Cancel (id `chat-queue-cancel-chat`); `chat-queue-thread-screen.swift` confirmation dialog before cancel when the thread has messages.
- Web steps: `chat-queue.api-client.ts` + `chat-queue.api.ts` add `cancelChatQueueThread`; `use-chat-thread.ts` add `cancelChat` and `hasAcceptedCard`; `chat-queue-thread.tsx` swap the Accept button for Finish/Cancel (testids `chat-queue-finish`, `chat-queue-cancel`).
- Tests: API `knowledge-bit-chat-queue-cancel.controller.test.ts` + integration `knowledge-bit-chat-queue-cancel.repo.integration.test.ts` (CI), `router.test.ts` route; web update Accept expectations in `use-chat-thread.test.tsx`, `chat-queue-thread-extras.test.tsx`, `chat-queue-screen.test.tsx`, `chat-queue-thread-proposals.test.tsx`, add `chat-queue-finish-cancel.test.tsx`; Swift `Tests/PostAnkiMacSmokeTests/chat-queue-finish-cancel-smoke-tests.swift` (button choice, cancel calls DELETE, finish calls approve) and `PostAnkiAPITests/chat-queue-cancel-tests.swift`.
- Risks: Finish approves the original item even if the user replaced it with accepted new cards (same as Accept today); approve fails with no active variant (existing behaviour).

## Done when
- Mac triage: Chat button / `C` moves the item to chat and the Chat sidebar count rises.
- Prompt on iPhone and Mac is stored; reply appears in the thread without the user waiting; cancel mid-generation leaves no stray messages.
- Chat close button is Finish or Cancel on iPhone, Mac and web; Cancel returns the item to triage with no thread.
- Touched vitest files, shared tests, and Swift smoke tests pass (capped workers, touched files only); `tsc --noEmit` and lint clean; migration generated.

## Defaults chosen
- Prompt stored in a new column, not as a lone user message: keeps the user+assistant pair invariant that replay, retry and delete-last rely on.
- Reuse `dispatchBackgroundJob`: existing durable path, fallback and flags.
- Chat tile opens the prompt sheet on both clients; swipe-up stays instant: fast path kept, prompt discoverable.
- Accepted `update` proposals count toward Finish: the item was improved by the chat.
- Cancel returns item to pending (not rejected): nothing was decided, nothing lost.
- No Mac undo for chat sends; no web prompt UI (not requested).
- Keep "Back to triage" beside Cancel: it preserves the conversation.
