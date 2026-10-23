## The ask
Root todo items 2, 13, 14 together: chat with a single knowledge item, refine it into 2-5 split
items via that chat, and highlight chat text to send to the KI inbox.

## Contract — proposed to post-anki-c7 (via orca), not yet confirmed/implemented server-side
`POST /knowledge-bits/:id/chat`
Request: `{ message: string, transcript?: { role: "learner" | "tutor"; content: string }[] }`
Response: `{ reply: string }`
404 if the bit doesn't exist (mirrors qa-chat's not_found shape). This is the only new endpoint
needed — proposed to mirror `qa-chat.service.ts` almost exactly (same generateWithRetry/
formatTranscript pattern, single-bit body as prompt context instead of curriculum/topic).

Prod isn't deployed and this endpoint doesn't exist in post-anki yet (proposed, not built) — the
iOS side is built against the contract as stated; a live round-trip cannot be verified either way.

## Reused, no new endpoint needed
- **Refine into splits**: once the learner is happy with the chat clarification, the client
  assembles a text blob (original bit body + relevant chat exchange) and submits it through the
  EXISTING `POST /knowledge-sources` + `POST /knowledge-sources/detect-bits` pipeline (already
  wired in `APIClient.createKnowledgeSource`/`detectKnowledgeBits`, IngestionDictationScreen.swift).
  The existing detector agent already splits 1-20 bits from any text; new items surface later in
  the existing `KnowledgeItemInboxScreen`. No "instant preview of 2-5 items" — same async-scan
  limitation as dictation ingestion.
- **Highlight-to-inbox**: same reuse — a text selection from the chat transcript, submitted the
  same way as a refine action. Functionally the same client code path as refine, just a shorter
  selected excerpt instead of the whole exchange.

## What to do
1. `APIClient.chatWithKnowledgeBit(id:message:transcript:)` — POST /knowledge-bits/:id/chat.
2. New `KnowledgeItemChatScreen(knowledgeBitId:bitBody:)` + `@Observable @MainActor` model:
   scrollable transcript, text input, Send button (mirrors IngestScreenModel's async-call pattern).
3. Text selection on any tutor reply bubble → a "Send to inbox" action that calls
   `createKnowledgeSource(text:)` + `detectKnowledgeBits()` with the selected excerpt, shows a
   confirmation banner (reuse the same submit/confirm pattern as IngestionDictationScreen).
4. A "Refine into knowledge items" button (always visible, not just after selection) that submits
   `bitBody + full transcript` the same way, for the "1 KI → 2-5 KIs" root-item behavior.
5. Entry point: a chat icon on `ExerciseScreen`'s "Knowledge bit" section (current.knowledgeBitId,
   current.bitBody already available there — ExerciseScreen.swift:115-119) navigating to
   `KnowledgeItemChatScreen`.

## Files by scenario
| Scenario | Files |
|---|---|
| Open chat from an exercise's knowledge bit | ExerciseScreen.swift (nav), new KnowledgeItemChatScreen.swift, APIClient.swift |
| Send a message, see the tutor's reply | KnowledgeItemChatScreen.swift |
| Select transcript text, send to inbox | KnowledgeItemChatScreen.swift (reuses createKnowledgeSource) |
| Tap "Refine into knowledge items" | KnowledgeItemChatScreen.swift (reuses createKnowledgeSource) |

## Done when
Builds clean via real `xcodebuild`. Installs and launches in the simulator. Simulator
tap-screenshot verification is currently broken in this environment (Accessibility permission
gap, noted in root todo.md) — verify reachability via code citation instead of a live screenshot,
say so explicitly. Cannot verify a live chat round-trip — the endpoint isn't even implemented
server-side yet, only proposed.

## Guardrails for whoever implements this
- Do NOT `git checkout`/`git restore` anything in `Sources/` — real, uncommitted `@MainActor`
  fixes are in place on the existing model classes.
- New model class follows the same `@Observable @MainActor` pattern as the existing ones.
- Do not invent a dedicated "split into N items" or "highlight capture" endpoint — both reuse the
  existing knowledge-source pipeline per the "Reused" section above.
- The chat endpoint is PROPOSED, not confirmed — if post-anki-c7 changes the shape after
  implementing it, that's a follow-up fix, not a blocker to building against the proposal now.
