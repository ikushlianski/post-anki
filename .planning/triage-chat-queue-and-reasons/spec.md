---
type: spec
state: draft
complexity: very-complex
updated: 2026-10-29
---

# Triage: Chat queue, new reject reasons, no end screen, extraction may return nothing

## The ask (verbatim intent)
- Swipe up = send card to a parked "Chat" queue; down stays Inbox; "AI example" stays reachable another way; overlay labels get SF Symbol icons.
- Working AI chat per queued card (endpoint, persistence, prompts, iOS screen); resolving ends in accept or reject.
- Remove the "triage finished" screen; after the last card show decided cards, emphasising NOT accepted.
- New reject reasons from real rejections; legacy codes stay valid.
- Extraction may return nothing; user sees a message.

## Facts (from code)
- Swipe: right approve, left reject; vertical = Inbox (down) / AI example (up), gated by scroll edge (`focus-triage-vertical-rules.swift`).
- Overlay labels are text only (`focus-triage-swipe.swift`).
- Action bar already has Inbox + AI example buttons (`focus-triage-view.swift`) so AI example is already reachable without a gesture.
- Inbox is not a triage decision: it is an approval state (`inbox` + `inbox_at`, migration 0126) tracked client-side as "extras"; decisions are only approved/rejected (`card-triage-decision.ts`).
- End screen = `FocusTriageDone` (title, feedback box, Done) + confirm screen + `FocusTriageResult` ("Triage saved"); session finish API takes feedbackText (default "") and decisions.
- A stateless per-card chat exists: `POST /knowledge-bits/:id/chat`, client sends transcript, no persistence, no turn cap, only for `approved`/`inbox` bits; iOS `KnowledgeItemChatScreen` is opened from Inbox.
- Reject reasons: `KNOWLEDGE_BIT_REJECT_REASONS` in `packages/shared/src/knowledge-bit-review-feedback.ts`; stored as plain text (no DB enum) in feedback + triage decision rows. Consumers: API decision repo (`reasonOf` filters by the list: narrowing it would null old rows), feedback-block + distiller prompts, web decisions list + why-strip + by-model admin, iOS `RejectReason` enum (`KnowledgeManageModels.swift`) + contract fixtures/tests, `docs/architecture/knowledge-bit/review-feedback.md`. Bot and extension do not use them (bot "gap-triage" is unrelated). No e2e suite references them.
- Extraction: default path = lessons agent (schema `.min(1)`, prompt "between 1 and N") then cards agent (`.min(1)`); business path prompt says "do not return an empty list"; empty after validation throws `no_valid_items`; a lessons-empty result is retried once. An `empty_result` attention state already exists for finished notes with no cards.

## Decisions made autonomously (reversible)
- Chat is a NEW approval state `chat` (+ `chat_at`), not a flag on Inbox: different workflow, own list, own count.
- Chat thread is server-persisted, one thread per card, server owns history (client sends only the new message). Old stateless chat stays untouched for approved/inbox cards and keeps refusing `chat` cards.
- Cost bounds (hard, in code, not prompt): 8 user turns per card; 1,000 chars per message; last 12 messages replayed; card + source excerpt context capped (~3k chars); reply capped (~400 tokens); cheapest tier already used for item chat; existing daily spend guard + hourly cap (as subject check); no tools in v1 (no web search); one in-flight turn per card; a failed model call does not consume a turn.
- Queue itself costs nothing: no model call happens until the user opens an item and sends a message. Starter prompts are static chips, not model calls.
- Security: card text, source excerpt and user messages are untrusted data inside escaped tags; chat agent has no tools and cannot change card state; only explicit user taps accept/reject; reply rendered as plain text (no auto-links/markdown actions).
- AI example default: stays a button in the triage action bar (and VoiceOver action); swipe-up no longer triggers it. Action bar = Inbox, Chat, AI example.
- Overlay icons: Approve `checkmark.circle.fill`, Reject `xmark.circle.fill`, Inbox `tray.and.arrow.down.fill`, Chat `bubble.left.and.bubble.right.fill`.
- Chat resolution: Accept = existing approve path (source state may be `chat`); Reject = existing reject path with reason chips (same new reasons); "Back to Inbox" and "Back to triage" also offered. Thread kept until card is resolved, then deleted with it (no FKs by convention, so delete paths must clean messages).
- End screen: removed, including confirm and "Triage saved". When the last card is decided (and nothing still being written) the decision list is the screen. Session finish fires automatically on leaving that list (flushing pending reason/note edits first); early "Finish" button goes straight to the same list, no confirm. Style notes keep being distilled server side; shown as one optional line, no screen.
- List order: Rejected, then Sent to Chat, then Sent to Inbox (prominent, each with reason chips/note where applicable); Accepted collapsed by default with a count.
- New reject reasons (selectable): `question_bent_to_answer` ("Question doesn't make sense, bent to fit the answer"), `restates_source_no_value` ("Just restates the text, no practical value"), `text_recall_only` ("Only checks the text's wording, not understanding"). Selectable legacy kept: `wrong_or_unsupported_answer`, `wrong_language`, `duplicate_or_overlap`, `other`. Legacy-only (valid, labelled, not offered): `too_vague_or_no_context`, `meta_wording`, `not_a_fact_or_trivial`, `bad_format`. Input still accepts legacy codes so older app builds keep working.
- Empty extraction: a chunk may legitimately yield zero lessons; deliberate empty is not retried and not an error. A note whose every chunk is deliberately empty ends "nothing extracted" (own marker, not failed, not generic empty_result).
- "Nothing of practical value" is judged against business-oriented reader; language-learning subjects keep their own path and are exempt.

## Assumptions to confirm
- `text_recall_only` is our reading of "compliance-with-text only"; wording may need the owner's correction.
- Turn cap 8 and 1,000-char message are defaults, env-tunable.
- Hiding Accepted by default (collapsed) satisfies "need not be shown prominently".

## Scope boundary
- No web search, no card editing by the model, no auto-triage of Chat items, no web UI for Chat queue (iOS only), no change to Inbox behaviour, no bot/extension changes.
- Tagged `added` and kept only because required: static starter chips (no cost, avoids blank screen); prompt hints in extraction for the 3 new reasons.

## Migrations (drizzle generate, then existing migrate script; never push)
- M1 `knowledge_bits.chat_at` + partial index on state `chat` (precedent: 0126 inbox).
- M2 new `knowledge_bit_chat_messages` (bit id, seq, role, text, client message id unique per bit, model id, token counts, created_at; no FKs).
- M3 `knowledge_sources` nothing-extracted marker (nullable timestamp).
- No migration: reasons (text columns), approval state value (text), LLM call purpose (existing `chat`).
- Tree already holds an uncommitted `0120_card_dedup_flags` migration: generate M1-M3 only after that lands/rebases so the journal does not collide.

## Docs to update with the code
`docs/architecture/knowledge-bit/review-feedback.md`, `apps/api/src/knowledge-bit/ingestion-pipeline.md`, iOS triage docs.
