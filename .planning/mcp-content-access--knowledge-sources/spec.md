# MCP read access to knowledge sources and knowledge bits

## The ask

MCP clients can browse what the learner pasted or imported (knowledge sources) and read the
knowledge bits extracted from them, with each bit's study questions.

## What to do

The MCP server already lets a client list decks and courses, read course structure and cards, and
search across cards, topics and knowledge bits. Search returns knowledge-bit matches, but there is
no way to list the sources those bits came from or to open a bit's full content. Add three
read-only tools in the same shape as the existing ones (input/result Zod schemas, `limit`/`offset`
paging with a default of 50 clamped to 200, expected misses returned as an error tag that the
register function maps to an `isError` message):

- `list_knowledge_sources` — newest first. Each item: id, kind, label (the source's summary when
  set, else the start of its raw text, trimmed to about 120 characters), source URL, subject id,
  status, created-at, and the count of approved bits. Optional `subjectId` filter.
- `get_source_knowledge_bits` — one source's approved bits in source order. Each bit: id, body,
  background, source links, topic id, and its active (not superseded) question variants as
  kind, prompt, answer, sentence. Unknown source id → `not_found`.
- `get_knowledge_bit` — one bit by id: the bit fields above, its source (id, label, URL), its
  approval state, and its active question variants. Unknown id → `not_found`.

Only approved bits appear in the source listing's count and in `get_source_knowledge_bits`; pending
or rejected ones are review-queue material, not learned content. `get_knowledge_bit` returns any
state but labels it, since a search hit can point at a pending bit.

## Files to touch

`apps/api/src/mcp/` — three new `*.tool.ts` files with co-located tests, a new register function
wired into `mcp.server-factory.ts`, and route-level tests next to the existing `mcp-*.route.test.ts`.
Read queries may live in a small repo file in `apps/api/src/knowledge-bit/` or
`apps/api/src/knowledge-source/` if no existing function fits.

## Done when

All three tools are listed by the MCP server and return the fields above against seeded data, with
unit and route tests covering paging, the approved-only rule, superseded variants being hidden, and
the not-found paths.
