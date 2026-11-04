---
type: architecture
state: draft
---

# Architecture

## Boundaries and ownership
- Shared contracts (`packages/shared`): reject reasons (selectable + legacy lists, one combined list for parsing), approval state `chat`, chat message/thread schemas, source "nothing extracted" outcome, caps as constants. Single source for API/web/iOS fixtures.
- Card state machine (API knowledge-bit module): `pending|inbox <-> chat`; `chat -> approved|rejected` via the existing approve/reject paths (allowed source states widened). Chat is not a triage decision; like Inbox it is a "move" with undo.
- Chat thread (new API sub-module `knowledge-bit-chat-queue`): owns messages, turn counting, caps, budget checks, prompt assembly. Does not own card state; calls the state machine.
- Chat agent (new Mastra agent, cheap tier, no tools): stateless; receives assembled prompt only. Registered with purpose `chat` for cost logging.
- iOS: triage UI (swipe, action bar, decision list) separate from the Chat queue feature (list + chat screen); they meet only through API client calls.
- Extraction: agents return `[]` deliberately; orchestrator distinguishes "deliberately empty" from "empty after validation"; source row records the outcome; attention/progress surfaces read it.

## Data contracts
- `POST /knowledge-bits/:id/chat-queue` (move in), `DELETE` (return to triage), `GET /knowledge-bits/chat-queue` (list + count).
- `GET /knowledge-bits/:id/chat-messages` -> messages + turnsLeft + capReached.
- `POST /knowledge-bits/:id/chat-messages` {clientMessageId, message<=1000} -> {reply, turnsLeft, capReached}; 409 if a turn is in flight, 429/423 style codes for cap and budget with stable error codes.
- Errors are stable codes (cap_reached, budget_paused, in_flight, not_in_chat) mapped to plain wording on clients.
- Triage decision/feedback payloads unchanged except reason enum values.

## Chat turn flow (cost + safety)
1. Validate: card in `chat`, message length, turns used < cap, no in-flight turn, daily spend guard + hourly cap (fail fast before any model call).
2. Idempotency: same clientMessageId returns stored reply.
3. Assemble: stable system prompt (rules, role, boundaries, output format) -> card (front/back/example) -> source excerpt around the card's quote (capped) -> last 12 messages -> new message. Stable prefix first for cache hits; no timestamps in prefix. Untrusted parts escaped and tagged as data.
4. Generate: no tools, max output cap, single step, existing retry wrapper (no extra retries on rate limit beyond wrapper).
5. Persist user + assistant messages together only on success; token counts stored for cost reporting.
6. Output handled as plain text; no URLs fetched, no actions.

## Resolution flow
Accept/Reject tap -> existing approval/reject endpoint (chat allowed as source) -> thread deleted in same transaction (no FKs, so delete + cleanup repos also delete messages).

## Triage end flow (iOS)
Last card or Finish -> decision list view (rejected / chat / inbox first, accepted collapsed) -> leaving triggers session finish (flush edits, then finish with empty feedback and undecided count). Confirm, Done, feedback, result screens removed; session model drops the confirming/writing/result phases, keeps saving + error + stale recovery.

## Extraction flow
chunk -> lessons agent (schema allows empty + optional reason) -> deliberate empty: no retry, no cards agent call (cheaper) -> chunk marked empty. All chunks empty -> source finished with nothing-extracted marker; any cards -> normal. Invalid/unquoted lessons keep the current retry + failure path.

## Reasons rollout
Shared lists change -> API repos must parse with the combined list (never the selectable one) -> web/iOS pickers use selectable list; labels map covers all codes -> iOS enum decodes unknown codes safely -> feedback-block/distiller prompts get labels for new codes.

## Risks
- Narrowing the reasons constant nulls old rows (mitigated by combined list).
- Widening approval state touches every query that lists by state (pending-review, counts, browser, example, chat): audit by grep for state lists.
- Migration journal collision with uncommitted `0120_card_dedup_flags`.
- Over-eager empty extraction: guard with eval fixtures for valuable short notes.
