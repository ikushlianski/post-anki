# Chat card control: spec

## The ask
- Learner steers exactly what goes into a new card from item chat (Q, A, optional example), on phone as well as desktop, and approves or rejects it inline.

## Today (verified)
- One button "Draft a new card from this chat" (`knowledge-bit-chat-draft-panel.tsx`).
- Agent returns free text (`proposedBody`), split into front/back at first newline or sentence (`splitDraftBody`).
- Only front and back are editable, after the draft. No example field in the UI, though `POST /knowledge-bits/:id/derived-items` already accepts `example`.
- No way to say what the card must contain, no text picking from the chat.
- Panel is `max-w-sm`, message list `max-h-96`. No bottom-sheet or selection pattern in the web app, except `domain-map-graph-detail-panel.tsx:26` (`fixed inset-x-0 bottom-0 ... sm:` sheet-to-side-panel), which is the layout to reuse.

## Behaviour
### A. Tell the agent (inline card in the chat)
- Trigger: user types `card: Q ... A ... example ...`, or `make a card: <what to cover>`, or asks for a revision ("change the example", "shorter answer").
- Data flow: message goes to the draft endpoint with the transcript and the user's instruction. Agent returns a structured card (front, back, optional example, sources, usedWebSearch).
- Chat shows it as a card message with Approve / Edit / Reject.
- Approve: saves via `POST /knowledge-bits/:id/derived-items` as a pending card, then the message shows "Saved, waiting in review". The card enters the normal review queue.
- Edit: opens the edit sheet (front, back, example). Save there approves.
- Reject: message collapses to "Discarded". Nothing is stored.
- Revision: a follow-up message revises the latest proposal and posts a new card message. Older proposals stay but their buttons disable.
- Exact wording: when the user supplies Q and A text, the agent uses it verbatim, only fixing the example or formatting if asked.

### B. Highlight in the chat
- Select text in any chat message. A floating bar appears: Use as front, Use as back, Use as example, Make fact.
- The first three fill the card tray field. Make fact asks the agent for a one-line fact card from the selection.
- Tray fields are always editable. Tray has Create card (saves pending) and Clear.
- Selection keeps working with long-press on touch. The bar is a normal toolbar, not hover-only.

### C. Mobile
- Under `sm`, chat is a full-height bottom sheet. From `sm` up it keeps the side panel.
- Touch targets 44px minimum. No hover-only controls.
- Composer sticks above the keyboard (track `visualViewport` height, `dvh` units).
- Card tray is a collapsible strip above the composer, showing a count and the three fields when open.
- Messages scroll independently. Inline card messages are full width.
- Mockup: `mobile-mockup.html` (3 frames at 390px).

## Architecture
- Shared contract in `packages/shared/src/knowledge-bit-chat.ts`: `cardProposalSchema { front, back, example?, sources, usedWebSearch }`. Draft input gains `instruction?: string` and `previous?: cardProposal` (for revisions). Draft result becomes `{ card: cardProposal }`. Old `proposedBody` stays during migration, then goes.
- Caps from the manual item schema: front 300, back 600, example 300.
- Agent (`knowledge-bit-chat-draft.agent.ts`): add structured output. Gotcha: OpenRouter web search drops `json_schema`. So without web research use structured output. With web research use two passes: research pass produces notes and sources, second pass has no tools and returns structured output. A fixed text format parsed with zod is the fallback.
- Chat message model gets a `card-proposal` kind with `status: proposed | saved | rejected` (client state only, not stored).
- `createKnowledgeItemFromChat` already passes `example`. Wire it through the UI.
- Highlight uses `window.getSelection()` scoped to the message list. No library needed.

## Backend changes
- Yes, small: draft schema (instruction, previous, structured result), agent output, service passes instruction. The derived-items route and database are unchanged. No migration.
- AI label rule unchanged: `aiGenerated` is true only when web research was used. User-dictated cards with no web research are not AI labelled.

## Cost and security
- One LLM call per proposal. Two when web research is on (research, then format). Revisions re-use the transcript, capped at the last 12 messages.
- User instruction is the task. Transcript, tool results and page text stay untrusted material, never instructions. Tool scope does not widen from user text ("search the web" in a message does not enable search, only the checkbox does).
- Sources: only http/https, max 5, rendered as plain links with `noopener noreferrer`.
- Card text rendered as plain text, never HTML.

## Build units (in order)
1. Shared schema: card proposal, instruction, previous. Done when: schema tests pass.
2. Agent and service: structured output, two-pass with web. Done when: unit tests cover verbatim Q/A, revision, web path.
3. Chat card-proposal message plus Approve / Reject (sends to derived-items). Done when: RTL test saves a pending card from the chat.
4. Edit sheet with front, back, example. Done when: edited values reach the save call.
5. Mobile layout: bottom sheet, 44px targets, keyboard-safe composer. Done when: 390px Playwright check shows composer visible with keyboard-sized viewport.
6. Highlight bar and card tray. Done when: selecting text and tapping Use as front fills the tray, Create card saves.
7. Remove the old one-button draft flow and `splitDraftBody`. Done when: no references remain.

## Open decisions (recommended default)
- Keep the old "Draft a new card" button as a shortcut that sends "make a card from this chat". Default: yes, as a chip above the composer.
- Make fact uses the model or only copies the selection. Default: copies as back and asks the model for the front only when the user taps Make fact.
- Store rejected proposals for analytics. Default: no.
- Several cards from one message. Default: one card per proposal for now.
