# Architecture

## Non-goals
- Not tagging, embedding, or placing bits into the hierarchy — later items in this direction
- Not building a UI trigger — backend scan endpoint only, same shape as the existing facts-
  embedding scan endpoint
- Not cron-scheduling the scan — manual trigger only, for now

## Why a separate `knowledge_bits` table, not `facts`
Grepped every read site of `facts` before deciding (per CLAUDE.md's mandatory grep-before-design
rule for personal projects). `cards-retrieval.orchestrator.ts` and the facts-embedding orchestrator
both scan/surface every `facts` row regardless of `topicId`/`source`, including rows with a null
`topicId` (`notion-sync.repo.ts`'s `insertFact` already creates some) — those are shown to the
learner as search results today. Inserting freshly-detected, untagged, unplaced bits straight into
`facts` would put half-processed content in front of the learner before tagging/placement ever
runs. `knowledge_bits` is a staging table; the later "place into hierarchy" item is what promotes a
bit into a real `facts` row once it has a topic, reusing `insertFactWithTopic` rather than cloning
it.

## Why a scan endpoint, not inline detection in the ingest POST
Directly informed by the sibling `accept-notion-source` item's own review history: doing expensive,
LLM-driven work inline in an ingest POST lets one call queue unbounded downstream cost, and couples
a fast, cheap operation (accepting text) to a slow, LLM-backed one (detecting bits). A separate scan
endpoint, with its own batch cap, keeps ingestion instant and bounds LLM spend independently of how
much prose has been submitted.

## Guardrails (agentic-feature checklist, `ai-dev/docs/principles/001-building-agents.md`)
- **Validation before spend**: the 50,000-char source-length check runs before the LLM call, not
  after — a hard limiter in code, not a prompt instruction.
- **Injection guard**: the source text is wrapped in `<source>...</source>` delimiters, with an
  explicit system-prompt instruction that content inside the delimiters is never an instruction to
  follow — mirrors biz-education's `<note>` pattern, which already works in production here.
- **Structured output, not free text**: the LLM's only valid response shape is `{ bits: string[] }}`
  via Zod `structuredOutput` — nothing it returns can execute as a command downstream, it can only
  fill an array of strings.
- **Hard batch cap in code**: `DETECT_BITS_BATCH_CAP = 20` sources per scan call, not a prompt
  instruction to "process reasonably" — bounds cost and run time deterministically.
- **Idempotent tool**: `insertKnowledgeBits` uses `onConflictDoNothing` on `(knowledgeSourceId,
  ordinal)` — re-running the scan (a retry, a bug fix, a duplicate trigger) can never duplicate
  bits, matching the "idempotent, not just retried" lesson from the Notion-import review round.
- **Real failure path, not silent swallowing**: a provider error marks the source `failed` with a
  `failureReason`, the same lesson the Notion error-allowlist round taught — an error must never be
  presented to the caller as if nothing happened, and must never leave a row stuck mid-pipeline
  forever.
- **Observability**: `{ processed, detected, failed }` counts are the scan's return value — the
  minimum instrumentation to answer "did this run do anything, and how much did it cost."

## Rollback
Additive: one nullable column, one new table with a unique index, one new route, four new files.
The one existing-file edit (`knowledge-source.controller.ts`'s new `.max(50_000)`) only rejects
requests that were never processable end-to-end anyway — no currently-valid request starts failing.
