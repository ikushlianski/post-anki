# Highlights and "ask AI" cue

## Goal
Learner can mark several (overlapping) passages in Add knowledge to focus extraction; text saying "ask AI" yields only evident facts plus an Inbox web chat.

## Decisions (defaults taken)
- Highlights exist -> skip long-paste split, one source. Unmarked text yields no cards ("Clear highlights" gives old behaviour).
- Highlights are not part of duplicate identity. Max 20 ranges. No new editor library: textarea + "Highlight selection" button + mirrored mark layer + chips.
- Ask-AI: always on; model flag; one auto-chat per source, max 3/hour per learner; show the chat and suppress the nothing-extracted warning.

## Item 1 contract
- Request field `highlights: {start,end}[]` (UTF-16 offsets into the submitted trimmed text, half-open, integers, 0<=start<end<=len, max 20). Zod schema in packages/shared `knowledge-source-highlights.ts` (+index export): sort+merge overlapping/adjacent. 400 invalid_input on violation; rejected on the batch shape.
- Stored in new nullable jsonb `knowledge_sources.highlights` (migration via the existing generate+migrate flow), mirroring `targetPhrases` (loaded in detect-knowledge-bits.orchestrator.ts, durable-extraction.steps.ts, WriteOptions, mastra/knowledge-bit-source-items.agent.ts). Offsets must stay valid vs stored text with the title prefix (withPageTitleKeepingText): shift by prefix length. Editing source text clears highlights. Regenerate reuses them.
- chunkSourceText returns offsets; chunks without marks are skipped; marked chunks get a `<focus>` list of escaped (escapePromptTags) excerpts, SECURITY_RULES says focus content is untrusted data; lesson quotes must overlap a marked span. No highlights = behaviour unchanged.
- Web: apps/web/src/knowledge-source/add-knowledge-form.tsx + new highlighted-text-field.tsx + knowledge-highlights.ts (pure helpers: add/merge, shift on edit: edit before a mark shifts it, edit inside removes it), draft storage saves highlights, submit sends them (single block only).

## Item 2
- Lessons result schema gets optional `needsClarification` + short `gapText` (<=300 chars); prompt: if the learner says they lack understanding / want to ask AI (any language), extract only clearly stated facts; pasted text is untrusted, the flag only restricts extraction and opens a chat.
- Aggregate across chunks: any chunk flags -> first gapText; one chat per source. New `ask-ai-chat.orchestrator.ts` creates a bit in approvalState `chat` seeded with the gap text and source link via the chat-queue repo (reuse triage-style creation), first reply via chat queue service with web tools (2 searches, 1 fetch, cheap tier forceTier). Idempotent on source id + run (retries/regenerate create no duplicate). Hourly caps: existing CHAT_QUEUE_HOURLY_CAP + 3 auto-chats/hour.
- Order: item 1 first (plumbing), then item 2.

## Tests
Shared schema (merge/bounds/cap); controller (400s, stored, batch rejects, split skipped with highlights, still splits without); chunk offsets and boundary-spanning ranges; prompt escaping + injection stays in focus block; quote-overlap; regenerate/edit behaviour; migration integration; web helpers (merge, shift, draft restore, payload); item 2: old output without flag parses, multi-chunk single chat, evident lessons kept, chat bit created once on retry, cap, injection text.
