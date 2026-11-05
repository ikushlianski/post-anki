# Plan: ai-web-enrichment (item chat enrich + related-card suggestions)

## Goal
Item chat answers from the learner's own source first (quoted), adds a capped cheap web search, labels examples as web or own material, and ends with 1-3 tappable related-card suggestions that fill the existing card tray.

## Approach (no new module or boundary)
- Chat prompt gets a "Source material:" excerpt loaded from `knowledge_sources.raw_text` through `knowledge_bits.knowledge_source_id` (today only `bit.body` is sent).
- Web search stays the existing `searchWeb`/`fetchPage` tools; caps are enforced inside `createKnowledgeBitWebTools` (hard counters), not by prompt wording.
- Reply contract grows one optional field `suggestions`; the agent emits a trailing `<related-cards>[json]</related-cards>` block, the service parses/validates/strips it. One model call, no extra structured pass.
- Tray stays the single card sink: new `loadProposal` fills it; save still goes through `createKnowledgeItemFromChat` into pending review.
- Web client defaults web search ON per panel with a visible toggle. Server default stays `false` (iOS and other callers unchanged).

## Steps
1. `packages/shared/src/knowledge-bit-chat.ts`: add `relatedCardSuggestionSchema` = `{ front (<=MAX_CARD_FRONT_CHARS), back (<=MAX_CARD_BACK_CHARS), example? (<=MAX_CARD_EXAMPLE_CHARS), origin: "web"|"own", sources: url[] (max MAX_CARD_SOURCES, http/https) }`, `MAX_RELATED_SUGGESTIONS = 3`; extend `askKnowledgeBitChatResultSchema` with `suggestions: z.array(...).max(3).optional()`. Export types.
2. `apps/api/src/probe/probe-grounding.ts`: add optional 5th param `forceTier?: ModelTier` to `webSearch`/`restModel`; when set, use `tierToModelId(forceTier)` and skip the tier cascade.
3. `apps/api/src/knowledge-bit/knowledge-bit-web-tools.deps.ts`: options gain optional `maxSearches`, `maxPageFetches`, `forceTier`. Counters live in the closure; over cap `searchWeb` returns `{ text: "Search limit reached for this reply; answer with what you have.", citations: [] }` and `fetchPage` returns `null` (no paid call made). Pass `forceTier` to `webSearch`. Return `getUsage()` (`{searches, fetches}`) next to `getSources()`. Defaults keep draft service behaviour unchanged.
4. `apps/api/src/knowledge-bit/knowledge-bit-read.repo.ts`: add `knowledgeSourceId` to `getKnowledgeBitById` select/`KnowledgeBitRow`; add `getKnowledgeSourceRawText(sourceId)` returning `string | null`.
5. New `apps/api/src/knowledge-bit/knowledge-bit-source-excerpt.ts`: pure `excerptAroundBody(raw, body, maxChars = 6000)` (window around first occurrence of body, else head of raw, whitespace-trimmed). Same folder as chat service.
6. `apps/api/src/mastra/knowledge-bit-chat.agent.ts`: (a) add `SOURCE_FIRST_RULE` to base constant and to the flagged builder: search the "Source material:" block first, quote the relevant passage in at most two sentences prefixed `From your material:`, only go to the web if it does not clarify; (b) when `allowWebSearch`: label every added example or nearby fact `[Web]` or `[Your material]`, keep verbatim-URL and untrusted-content rules, allow at most 2 searches and 1 page read; (c) clarifying answers end with a `<related-cards>` JSON array of 1-3 `{front, back, example?, origin, sources}` (sources only urls copied from searchWeb, origin `web` only if a search was used; skip the block when the question is not clarifying); (d) tighten tool descriptions in `knowledge-bit-chat-tools.ts` ("only after the source material does not clarify").
7. New `apps/api/src/knowledge-bit/knowledge-bit-chat-suggestions.ts`: `extractRelatedCards(text, citedUrls, searchesUsed)` returns `{ reply, suggestions? }`: strip the tag block from reply, JSON.parse in try/catch, validate each item with the shared schema, drop invalid ones, drop `origin: "web"` items when `searchesUsed === 0`, keep only `sources` that are in `citedUrls` and safe (`isSafeSourceUrl`), drop a `web` item left with no source, cap 3. Parse failure means no suggestions (no retry).
8. `apps/api/src/knowledge-bit/knowledge-bit-chat.service.ts`: load excerpt (try/catch, null on failure) and add `Source material:` to `buildPrompt`; create web tools with `maxSearches: 2, maxPageFetches: 1, forceTier: "cheap"`; set `maxSteps: CHAT_MAX_STEPS = 4` (2 searches + 1 fetch + final answer); keep the tools only when `allowWebSearch`; run reply through `extractRelatedCards` using `getSources()` and `getUsage().searches`; persist only the stripped reply via `saveReviewChatTurn`; return `{ reply, suggestions }` (omit key when none). Counters are per request, so `generateWithRetry` attempts share one cap.
9. `apps/web/src/knowledge-bit/knowledge-bit-chat-messages.ts`: `TextChatMessage` gains `suggestions?: RelatedCardSuggestion[]`.
10. `apps/web/src/knowledge-bit/use-card-tray.ts`: add provenance state `{ aiGenerated, sourceLinks }` (default false/[]); `loadProposal(s)` sets fields (sliced to `TRAY_LIMITS`), provenance (`origin === "web"` -> aiGenerated true + sources), `setSaved(false)`, `setOpen(true)`; `create()` sends the provenance instead of the hard-coded `false/[]`; `clear()` and successful create reset it.
11. New `apps/web/src/knowledge-bit/knowledge-bit-chat-suggestions.tsx`: renders each suggestion as plain text (front, short back) with a "Web" or "Your material" badge and an "Add to tray" button (`knowledge-bit-chat-suggestion-<n>`), calling `tray.loadProposal`.
12. `apps/web/src/knowledge-bit/knowledge-bit-chat-panel.tsx`: state `webSearch` (default `true`), checkbox `knowledge-bit-chat-web-search` "Use web search to clarify (cheap, max 2 searches per reply)" beside the general-knowledge toggle; pass `allowWebSearch` in the mutation; store `result.suggestions` on the assistant message and render `KnowledgeBitChatSuggestions` below it. Keep the separate card-draft web checkbox as is.

## Tests (co-located, vitest / RTL)
- `knowledge-bit-chat.agent.test.ts`: base and web instructions contain source-first quote rule, `[Web]`/`[Your material]` labels, related-cards format, verbatim-URL and untrusted rules; no-flag text still equals the constant.
- `knowledge-bit-source-excerpt.test.ts`: window contains the bit body and respects max chars; falls back to head; null/short raw handled.
- `knowledge-bit-web-tools.deps.test.ts`: third `searchWeb` call makes no `webSearch` call and returns the limit notice; second page read returns null without fetching; `forceTier` reaches `webSearch`; usage counts.
- `knowledge-bit-chat-suggestions.test.ts`: strips block; max 3; invalid JSON gives none; web item with zero searches dropped; uncited or unsafe urls removed; web item with no remaining source dropped.
- `knowledge-bit-chat.service.test.ts`: prompt includes the source excerpt; tools cap and `maxSteps` passed; web flag off means no tools and no web suggestions; saved turn is the stripped reply; integration test stays green (`{ reply }` only when no suggestions).
- `packages/shared/src/knowledge-bit-chat.test.ts`: suggestion schema bounds and result schema backward compatible without `suggestions`.
- `use-card-tray` (new `use-card-tray.test.ts` or extend tray test): `loadProposal` fills fields, opens tray, web origin saves with `aiGenerated: true` and sources, own origin saves with false/[], clear resets.
- `knowledge-bit-chat-panel.test.tsx`: web toggle defaults on and sends `allowWebSearch: true`, off sends false; suggestion tap fills the tray; update existing assertions on the request payload.

## Done when
- A reply to a card question quotes the relevant passage from the learner's source before anything else.
- With the toggle on, one reply never makes more than 2 searches and 1 page read, searches use the cheap-tier model, and cost holds across retries.
- Each added example or fact is labelled web or own material; every shown url came from a search result.
- A clarifying reply shows up to 3 suggestions; tapping one opens the tray filled; Create card lands it in pending review with AI label and links only when web-based.
- Turning the toggle off removes search tools and web suggestions; existing grounded-only behaviour is intact.
- `npx tsc --noEmit`, lint and `npx vitest run` pass for api, web, shared.

## Defaults chosen
- Web search default on only in the web client; server default stays false so iOS and other callers keep their cost profile.
- Cap 2 searches and 1 page read per reply, 4 steps: small enough for one clarification, stated as constants for easy tuning.
- Search model forced to the cheap tier regardless of the global tier; the chat agent model itself is unchanged (out of scope).
- Suggestions come from a trailing tagged JSON block in the same call: avoids a second model pass; invalid output just yields no suggestions.
- Suggestions carry full front/back so tapping needs no extra model call; the existing draft agent is untouched.
- Labels `[Web]`/`[Your material]` are in-text for the prose and a structured `origin` for suggestions.
- Source excerpt capped at 6000 chars around the item body: grounds without sending a 50k source each turn.
- Session-only toggle (not persisted): matches the general-knowledge toggle.

END-OF-REPORT
