---
type: plan
branch: learn-from-doc-site
task: grounded-knowledge-chat--card-labels
complexity: complex
state: draft
updated: 2026-09-19
---

# Surface a card's subject, tags, and confirmed domain node alongside its topic

## What and why

The direction's own Scope line ("Label cards along existing dimensions only — subject, topic,
tags, domain-map, no new taxonomy") isn't yet satisfied: every card-facing query
(`listEmbeddedCardVariants`, `findTopMatchingCards`) surfaces only `topicId`/`topicTitle` today.
No new taxonomy is needed — subject, tags, and domain-map already exist as tables; this is a
missing read path, not a missing dimension. Subject/topic are always populated for a card (`NOT
NULL` FK chain); tags and a confirmed domain node are legitimately sometimes absent for a given
topic/curriculum, so both are optional in the output — never invented when missing.

## Phases

### Phase 1: extend the card read path with subject/tags/domain-map
Goal: `listEmbeddedCardVariants` (apps/api/src/cards/cards.repo.ts) joins out to `curricula` (for
`subjectId`/subject name via `subjects`), `tagAssignments` filtered to `nodeType = "topic"` for
the card's topic, and `curriculumDomainNodeMappings` filtered to `status = "confirmed"` joined to
`domainNodes` for the card's curriculum — tags and domain node stay optional/empty when absent,
never fabricated. `CardMatchResult` (packages/shared/src/cards.ts) gains `subjectId, subjectName,
tags: string[], domainNodeName: string | null`. `findTopMatchingCards` (apps/api/src/cards/
cards-retrieval.orchestrator.ts) passes the new fields through unchanged.
Key files: `apps/api/src/cards/cards.repo.ts`, `apps/api/src/cards/
cards-retrieval.orchestrator.ts`, `packages/shared/src/cards.ts`.

## Constraints and risks

- No new taxonomy tables or columns — this reuses `subjects`/`tags`/`tagAssignments`/
  `domainNodes`/`curriculumDomainNodeMappings` exactly as they exist today.
- Tags and domain node are optional by design (a topic can have zero tag assignments; a
  curriculum can have zero confirmed domain-node mappings) — the query must not require either to
  exist, and the response must represent "none" honestly (empty array / null), never omit the
  field or throw.
- This is a read-path change only — no new UI consumer required by the direction's Scope; the
  existing `/cards/matches` and embedding-scan endpoints just carry richer data now.
