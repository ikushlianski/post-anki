---
type: plan
branch: learn-from-doc-site
task: grounded-knowledge-chat--facts-in-chat
complexity: complex
state: draft
updated: 2026-09-19
---

# Include Notion facts in the global chat's grounding

## What and why

The Notion router now lands `SPA`-tagged reading notes in a `facts` table (commit 1520549) that
already carries the same `embedding`/`embedding_hash`/`embedded_at` columns as cards. Until facts
are embedded and retrieved, the chat can't answer from them — which is the whole point of tagging a
note `SPA`. This closes the loop: embed facts with the exact card pattern, retrieve cards and facts
together, and show a fact in the grounding line like a card.

Decision (autonomous, reversible): the chat's grounding entry for a fact shows the fact's first
~80 characters as its "prompt" and `topicTitle: "Reading notes"`, so the existing
`GlobalCardChatMatchedCard` shape and panel need no change.

## Phases

### Phase 1: embed facts
Goal: `embedFacts()` mirrors `embedVariants` in `apps/api/src/cards/cards-embedding.orchestrator.ts`
(hashContent → selectSubjectsForScan → embedTexts → write back, `EMBEDDING_CAP` bound). It runs at
the end of every Notion sync (`runNotionSync` calls it after the connectors, failure logged and
non-fatal, exactly like `compileCards` → `embedVariantsForTopic`) and via the existing
`POST /cards/embedding-scan` handler, which now scans cards then facts and returns both counts.
Key files: `apps/api/src/notion-connector/notion-sync.repo.ts` (list/update for embedding),
`apps/api/src/facts/facts-embedding.orchestrator.ts` (new, entity-first folder), the sync
orchestrator, `cards.controller.ts`, `packages/shared/src/cards.ts` (result gains `facts` counts).

### Phase 2: retrieve and ground on facts
Goal: `findTopMatchingCards` becomes a union: rank embedded card variants and embedded facts
together with one `rankBySimilarity` call; `CardMatchResult` gains `kind: "card" | "fact"`
(cards keep every existing field; a fact fills `prompt` with its body, `answer` with "", `topicId`
with `"facts"`, `topicTitle` with `"Reading notes"`, `subjectId`/`subjectName` with `""`, `tags`
with the fact's tags, `domainNodeNames` with `[]`). The chat prompt renders a fact as `- Fact: …`
instead of `Q/A`, and the grounding line shows it by its first 80 characters. Update the
existing tests; add an integration test proving a fact outranks an unrelated card for a matching
query and appears in `matchedCards`.
Key files: `apps/api/src/cards/cards-retrieval.orchestrator.ts`, `cards.repo.ts` (or the facts
repo), `packages/shared/src/cards.ts`, `apps/api/src/global-card-chat/global-card-chat.service.ts`,
`apps/web/src/global-card-chat/global-card-chat-panel.tsx` (only if the 80-char cut lives there).

## Constraints and risks

- Reuse, never fork: the embed and rank helpers are shared already; adding facts must not copy them.
- `kind` is additive — every existing consumer of `CardMatchResult` keeps working with `kind: "card"`.
- No new persistence beyond what exists.
