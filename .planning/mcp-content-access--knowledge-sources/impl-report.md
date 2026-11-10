# Implementation report: MCP knowledge sources and bits

## Files created (apps/api/src/)
- knowledge-source/knowledge-source-mcp.repo.ts (read queries; reuses `bitApproved`)
- mcp/knowledge-source-label.ts (+ .test.ts)
- mcp/knowledge-bit-variants.ts (shared variant schema and grouping)
- mcp/list-knowledge-sources.tool.ts (+ .test.ts)
- mcp/get-source-knowledge-bits.tool.ts (+ .test.ts)
- mcp/get-knowledge-bit.tool.ts (+ .test.ts)
- mcp/register-knowledge-source-tools.ts
- mcp/mcp-knowledge-sources.route.test.ts
- mcp/knowledge-source-tools.integration.test.ts

## Files changed
- mcp/mcp.server-factory.ts (registers the new tools)
- mcp/mcp.route.test.ts (tools/list expects the three new read-only tools)
- mcp/mcp-read-only.integration.test.ts (snapshot includes knowledge tables; new tools called)

## Tests (from apps/api)
- `npx vitest run` on the 5 new unit files + mcp-knowledge-sources.route.test.ts + mcp.route.test.ts: 6 files, 26 tests passed (route file re-run after a type fix: passed).
- `npx vitest run --config vitest.integration.config.ts src/mcp/knowledge-source-tools.integration.test.ts src/mcp/mcp-read-only.integration.test.ts` with DATABASE_URL from .env.local (127.0.0.1:5562; tests create and drop a temp database): 2 files, 5 tests passed.
- Note: integration files need the separate integration config; the default config excludes them.

## tsc
`npx tsc --noEmit -p apps/api`: no errors in the mcp/ or knowledge-source-mcp files (one type error in my route test was fixed; other-file errors were not examined).

## Defaults chosen
- Label: summary if non-blank, else raw text; whitespace collapsed; cut at 120 chars plus an ellipsis.
- Paging (default 50, clamp 200, in SQL) applies to all three list-like results; `get_knowledge_bit` has none.
- Bits ordered by ordinal; variants by kind then order.
- `get_knowledge_bit` returns `source: null` if the bit's source row is missing.
- Input names: `sourceId` for get_source_knowledge_bits, `id` for get_knowledge_bit.
- The source listing includes sources with zero approved bits (count 0).
- Newest-first tie-break on id.

## Left undone
Nothing from the spec. No commits or staging; `mcp.route.ts` untouched.
END-OF-REPORT
