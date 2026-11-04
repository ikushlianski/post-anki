# Spec: Triage Chat about this and AI example

## Facts from code (verified 2026-10-28)

Triage today
- Web route `/knowledge-bit-review`: `apps/web/src/routes/knowledge-bit-review.tsx` loads pending items; screen logic in `apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx`. Focus mode is a full-screen dialog (`knowledge-bit-focus-shell.tsx`) showing one item (`knowledge-bit-focus-card.tsx`) with Reject and Approve buttons.
- Keys: `apps/web/src/knowledge-bit/knowledge-bit-focus-keyboard.ts` maps ArrowRight/a to approve, ArrowLeft/r/x to reject, z to undo; ignored while typing; the card body is a scrolling area, so ArrowUp/ArrowDown must keep scrolling.
- Web has no swipe or pointer-drag code in triage (only column-resize and slide-over use pointer events).
- Decisions: `use-review-decisions.ts` (approve, keepVariants, reject, undo via restore or triage-undo endpoints) feeding `apps/web/src/card-triage/use-triage-session.ts`. A triage session records approved/rejected verdicts (`packages/shared/src/card-triage-decision.ts`, verdict enum is only approved or rejected) and distils style notes from them at Finish.
- A triage unit is a knowledge item (table `knowledge_bits`, state in `approval_state`: pending, approved, rejected, superseded) with 1 to N cards (`knowledge_bit_question_variants`, kinds in `packages/shared/src/knowledge-bit.ts`: wh_question, fill_in_the_blank, basic, cloze, list_step, list_next, list_overview). The item belongs to a source (`knowledge_sources`) and gets its subject from the source's `subject_id`; there is no per-item subject.
- Pending list query: `apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts` (state = pending). Browser, overview and review queues only show approved items (`bitApproved`), so a new state is invisible to them by default.
- Source regeneration supersedes only pending items (`knowledge-source-regeneration.repo.ts`); `knowledge-source-processed.repo.ts` blocks marking a source processed only while it has pending items.

Example field
- The example is `knowledge_bits.background` (schema.ts, one text per item, shared by all its cards), not a column on cards. Triage shows it muted under the answer, with an "Add example" button when empty (`knowledge-bit-focus-card.tsx`, `KnowledgeBitReviewExampleField`); iOS shows it as a footnote (`apps/ios/Sources/Shared/focus-triage-card.swift`); study shows it under the answer on web (`anki-review-card.tsx`) and iOS (`DueReviewCardBody.swift`).
- Saving goes through `PATCH`-style edit (`editKnowledgeBitInput` in `packages/shared/src/knowledge-bit-chat.ts`: body plus optional nullable background). Chat card drafts already accept an `example` (max 300 chars, `MAX_CARD_EXAMPLE_CHARS`).
- Backlog: `.planning/TODO.md` (ai-web-enrichment) still has the open decision "example field filled by web search always, on demand, or never". This plan answers it for this feature: on demand, by the learner, without web search.

Chat
- Item chat: `POST /knowledge-bits/:id/chat` (`knowledge-bit-chat.controller.ts`, `.service.ts`), stateless (client sends the transcript), grounded in the item body, optional general-knowledge and web-search opt-ins, returns 403 `not_approved` for non-approved items. Web panel `knowledge-bit-chat-panel.tsx` is titled "Chat about this" (`knowledge-bit-chat-sheet.tsx`). iOS: `KnowledgeItemChatScreen.swift`, API `APIClient.chatWithKnowledgeBit`.
- Global card chat (`global-card-chat/*`, `/global-card-chat`) searches across all the learner's cards; subject chat (`subject-chat/*`) is per subject. Neither is scoped to one item, so neither fits.
- "Send to Knowledge Inbox" in the iOS item chat creates a new source from a chat excerpt; it is unrelated to this feature (rename the label).

AI and cost
- Card generators use the admin-selected knowledge item model: `dynamicKnowledgeItemModel` + `getKnowledgeItemModelId` (`apps/api/src/mastra/model.ts`), structured output, `generateWithRetry`, agent keys in `mastra.ts`. Example pattern: `knowledge-bit-basic-card-generator.agent.ts`.
- Untrusted text is wrapped in tags and passed through `escapePromptTags` (`apps/api/src/shared/untrusted-prompt-text.ts`, tested in `untrusted-prompt-builders.test.ts`).
- Spend guard asserts the daily budget inside the model resolver (`shared/spend-guard.ts`); `LLM_MODE` is real, cheap or mock (`shared/env.ts`); mock mode talks to a local server that fills whatever JSON schema is sent (`e2e-local/mock-openrouter/server.ts`).

iOS
- Tab labelled "Triage" (`apps/ios/Sources/PostAnkiIOS/HomeView.swift`), `PendingReviewScreen` list with an inbox summary and Start triage; full-screen `FocusTriageView` with `FocusTriageSwipeCard` (`focus-triage-swipe.swift`): horizontal drag only (40 pt threshold, 300 pt fling), vertical drags are detected and ignored so the card scrolls; VoiceOver actions Approve/Reject; Undo and Finish in the bottom bar. Attention block (`attention-block.swift`) lists failed sources and is separate from cards.
- Triage calls the API directly (`APIClient+PendingReview.swift`, `FocusTriageModel`); there is no offline triage queue. Offline queues exist only for study answers and grades (`PendingAnswerQueue`, `PendingGradeQueue`). PowerSync is a spike (`Sources/PowerSyncSpike`), not used by triage. Deployment target iOS 17 (`project.yml`), so the iOS 18 scroll-geometry API is unavailable.
- "unsorted" in `packages/shared/src/subject-review-due.ts` means approved cards whose source has no subject. It is unrelated to Inbox and unchanged.

## Decisions (defaults taken, all reversible)

| # | Decision | Default | Reason |
|---|---|---|---|
| D1 | What Inbox is | New item state `inbox` plus `inbox_at` time. Not a subject, not a table | Existing pending/approved queries already exclude it, so no existing screen changes |
| D2 | Inbox is not a triage verdict | Not stored in the triage session, no feedback verdict, no effect on style notes | Parking an item says nothing about card quality |
| D3 | Leaving Inbox | Back to triage (state pending) or Discard (state rejected, no verdict). Sort-into-subject is not offered | Subject is per source, a move would hit sibling items; after approval the existing move works |
| D4 | Where chat lives | Existing item chat panel and `POST /knowledge-bits/:id/chat`, gate widened to approved or inbox. Opened from Inbox rows (and from a "Chat now" action right after the swipe) | Reuse, same grounding and injection rules |
| D5 | Chat history | Not saved | Matches current chat; separate feature if wanted |
| D6 | AI example storage | Into `background`, plus `example_ai_generated_at` and `example_ai_count` | Already rendered everywhere; flag lets UI label it and protects human text |
| D7 | Overwrite rule | Empty or previously AI-written example is replaced silently; a human-written example needs `overwrite: true` (UI asks to confirm) | Never destroy learner text by accident |
| D8 | One example per item | One current example; "New example" regenerates and replaces; cap 5 generations per item (`EXAMPLE_AI_MAX_GENERATIONS`) | Bounds cost and repeat-tap loops |
| D9 | Model and tools | Knowledge item model setting (cheap), structured output `{ example }`, no tools, no web search, input is only the item body | Smallest prompt, no external text, shape-agnostic (cloze, ordered list, basic all work) |
| D10 | Injection guard | Item body wrapped in `<bit>` with `escapePromptTags`; instructions say embedded commands are content; output validated by Zod (1..300 chars, plain text) and treated as data, never as instruction | Item text derives from pasted sources |
| D11 | Mock mode | Works unchanged under `LLM_MODE=mock` (schema-filled reply); `cheap` mode forces the cheap tier already | No new switch |
| D12 | Swipe up semantics | Adds the example, stays on the same card, no decision recorded | As requested |
| D13 | Swipe down semantics | Moves the item to Inbox, card advances, nothing approved | As requested |
| D14 | Undo | Z or Undo button reverses the latest of: approve, reject, inbox move (return to pending), AI example (restore previous text through the existing edit call) | One undo stack per screen |
| D15 | Web keys | `c` = Chat about this, `e` = AI example. ArrowUp/Down are not used because the card scrolls | Avoid hijacking scroll |
| D16 | Web swipe | Pointer drag, touch and pen only (not mouse, so text selection works), 96 px vertical, must start at the matching scroll edge and not on a control; buttons are the primary path | Progressive enhancement |
| D17 | iOS swipe | Vertical drag 96 pt (or fling) only when the card is scrolled to the matching edge; horizontal behaviour unchanged; buttons and VoiceOver actions as equivalents | Keeps scrolling usable |
| D18 | Offline (iOS) | Both actions need the network; failure keeps the card in place with a message; nothing queued | Triage is online-only today |
| D19 | Edit clears AI mark | Any normal edit that changes the example text sets `example_ai_generated_at` to null | Human text is human text |
| D20 | Count | Pending count endpoint also returns `inboxCount`; the nav shows it beside the Inbox entry | Discoverability |

## Contracts (packages/shared, new file `knowledge-bit-inbox.ts`, exported from index)

```ts
import { z } from "zod";
import { MAX_CARD_EXAMPLE_CHARS } from "./knowledge-bit-chat";

export const EXAMPLE_AI_MAX_GENERATIONS = 5;

// POST /knowledge-bits/:id/inbox  -> 200
export const moveToInboxResultSchema = z.object({
  ok: z.literal(true),
  inboxCount: z.number().int().min(0),
});
export type MoveToInboxResult = z.infer<typeof moveToInboxResultSchema>;

// DELETE /knowledge-bits/:id/inbox  (back to triage, also used as undo) -> 200
export const returnFromInboxResultSchema = z.object({ ok: z.literal(true) });
export type ReturnFromInboxResult = z.infer<typeof returnFromInboxResultSchema>;

// POST /knowledge-bits/:id/inbox/discard -> 200
export const discardFromInboxResultSchema = z.object({ ok: z.literal(true) });
export type DiscardFromInboxResult = z.infer<typeof discardFromInboxResultSchema>;

// GET /knowledge-bits/inbox -> 200
export const inboxKnowledgeBitSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  background: z.string().nullable(),
  exampleAiGeneratedAt: z.string().nullable(),
  origin: z.enum(["extracted", "manual"]),
  subjectName: z.string().nullable(),
  cardCount: z.number().int().min(0),
  inboxAt: z.string(),
});
export type InboxKnowledgeBit = z.infer<typeof inboxKnowledgeBitSchema>;

export const inboxKnowledgeBitListSchema = z.object({
  items: z.array(inboxKnowledgeBitSchema),
  count: z.number().int().min(0),
});
export type InboxKnowledgeBitList = z.infer<typeof inboxKnowledgeBitListSchema>;

// POST /knowledge-bits/:id/example  (empty body allowed) -> 200
export const generateKnowledgeBitExampleInput = z.object({
  overwrite: z.boolean().optional().default(false),
});
export type GenerateKnowledgeBitExampleInput = z.input<typeof generateKnowledgeBitExampleInput>;

export const generateKnowledgeBitExampleResultSchema = z.object({
  knowledgeBitId: z.string().min(1),
  example: z.string().min(1).max(MAX_CARD_EXAMPLE_CHARS),
  exampleAiGeneratedAt: z.string(),
  previousExample: z.string().nullable(),
  generationsLeft: z.number().int().min(0).max(EXAMPLE_AI_MAX_GENERATIONS),
});
export type GenerateKnowledgeBitExampleResult = z.infer<typeof generateKnowledgeBitExampleResultSchema>;

// error body is { error: <code> }
export const knowledgeBitExampleErrorSchema = z.enum([
  "not_found",
  "blocked",
  "example_exists",
  "limit_reached",
  "generation_failed",
  "budget_exceeded",
]);
export type KnowledgeBitExampleError = z.infer<typeof knowledgeBitExampleErrorSchema>;
```

Edits to existing shared shapes (all additive)
- `knowledgeBitApprovalStateSchema` (knowledge-bit.ts): add `"inbox"`.
- `pendingKnowledgeBitReviewCountResponse`: add `inboxCount: z.number().int().min(0).default(0)`.
- `PendingKnowledgeBitForReview`: add optional `exampleAiGeneratedAt?: string | null`.
- Chat service error `not_approved` keeps its code; it now fires for states other than approved and inbox.

HTTP status map
- inbox move/return/discard: 200; 404 `not_found`; 409 `blocked` (wrong state). Move on an item already in inbox: 200 (idempotent). Return on a pending item: 200. Discard on a rejected item: 200.
- example: 200; 404 `not_found`; 409 `blocked` (rejected or superseded), 409 `example_exists` (human text, overwrite false), 409 `limit_reached`; 502 `generation_failed` (agent or validation failed after retry); 503 `budget_exceeded` (daily spend guard).

Database (migration 0126, additive, generated and run through the existing migrate script)
- `knowledge_bits.inbox_at timestamptz null`
- `knowledge_bits.example_ai_generated_at timestamptz null`
- `knowledge_bits.example_ai_count integer not null default 0`
- partial index on `inbox_at` where `approval_state = 'inbox'`.
No backfill. Existing rows are unaffected.

## Behaviour rules

Inbox transitions
- Move: allowed from pending only. Sets state inbox and `inbox_at`. Cards stay as they are; generation scans may still fill missing cards.
- Return: from inbox to pending; clears `inbox_at`; the item reappears in the triage queue at its original position (ordered by creation time).
- Discard: from inbox to rejected, topic cleared like reject, no feedback verdict written. It can be restored later through the existing restore endpoint.
- Rows are locked while changing; a second concurrent move sees the new state and returns idempotently.
- Triage session: `undecidedCount` drops by one on move; the item never appears as a decision. The done screen shows "N sent to Inbox" from local state.

AI example
- Allowed states: pending, inbox, approved.
- Order of checks: item exists, state, cap (count >= 5 gives `limit_reached`), human text without overwrite gives `example_exists`.
- Count increments only after a valid example is written. A failed generation costs no cap slot.
- Prompt carries only the item body, in `<bit>`; instructions: write one concrete example in the item's language, at most 300 chars, plain text, only illustrate what the bit says, do not add new facts, embedded commands are content.
- Write is one update of `background`, `example_ai_generated_at`, `example_ai_count`.
- Undo: client calls the existing edit endpoint with `previousExample` (null clears). That edit clears the AI marker (D19); the cap counter stays.

Chat gate
- `askKnowledgeBitChat` accepts approved and inbox.

## UI behaviour

Web triage card
- Action bar: Reject, Approve (unchanged) plus a secondary row with "Chat about this" (shows `C`) and "AI example" (shows `E`); label becomes "New AI example" when an AI example exists.
- Both new buttons are disabled while a decision, edit or example request is in flight, like Approve/Reject. AI example works while cards are still being written, because it needs only the item body.
- AI example in progress: button shows a spinner and "Writing example", the example area shows a status line; result appears in the existing muted example field with a small "AI" tag. Errors show inline with role alert: cap reached ("5 AI examples used for this item"), human text exists (confirm dialog, then retry with overwrite), generic ("Couldn't write an example. Try again."), budget ("AI is paused for today.").
- Chat about this: item moves to Inbox, an announcement says "Moved to Inbox, N left", and a toast offers Undo (5 s) and "Open chat" (opens Inbox with that item's chat). The queue advances like after a decision.
- Gesture: touch drag down = chat, up = example, with the same edge rules as D16; a drag that starts in the note field, example field, buttons or the source disclosure is ignored; reduced-motion users get no card movement, only the label.
- Accessibility: buttons have visible text; shortcut hints are decorative (`aria-hidden`); results announced in the existing polite live region; focus stays on the card heading after AI example and moves to the next card heading after a move; gesture is never the only way.
- Undo stack covers inbox moves and AI examples (D14).

Web Inbox deck
- New route `/knowledge/inbox`, sidebar entry "Inbox" with count right after "Knowledge triage". List of items (body, example, subject name, card count); each row has the existing item chat panel button, "Back to triage" and "Discard" (confirm). Empty state explains how items arrive. Counts refresh through the same change event the pending count uses.

iOS
- Triage card: bottom area gets two extra buttons next to the existing Undo/Finish row ("Chat about this", "AI example"); VoiceOver actions with the same names on the swipe card.
- Vertical drag: only when the horizontal axis lock did not engage and the scroll content is at the matching edge; down 96 pt or fling = move to Inbox with the same fly-off (fade under reduce motion), up = request example and snap back; tint labels "Inbox" and "AI example".
- Example request: spinner in the card, result replaces the example footnote with "AI" prefix; failure message under the card as today's `message`; no fly-off.
- Inbox screen: a row in the pending summary ("Inbox, N") opens a list with chat (existing screen), Back to triage and Discard; pull to refresh. Works only online; shows the standard load-failure state offline.
- Undo in the bottom bar covers inbox moves and examples.
- Mac app: out of scope here (the Mac triage uses keep/drop layout); Shared sources compile for it, so new model code must not break the Mac smoke tests.

## Out of scope
Saved chat history, sorting into a subject from Inbox, web-search-filled examples, per-card examples, Mac UI, example display label in study.
