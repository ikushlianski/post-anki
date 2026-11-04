# Review: MCP knowledge sources and bits

Verdict: PASS (independent read-only reviewer; it could not write files, so its returned verdict is recorded here verbatim in substance).

No Critical or High findings. 6 unit/route test files, 26 tests, passed on the reviewer's run.

- List sources: apps/api/src/knowledge-source/knowledge-source-mcp.repo.ts:58, label at apps/api/src/mcp/list-knowledge-sources.tool.ts:59
- Source's approved bits: apps/api/src/knowledge-source/knowledge-source-mcp.repo.ts:106, tool at apps/api/src/mcp/get-source-knowledge-bits.tool.ts:48
- One bit by id: apps/api/src/mcp/get-knowledge-bit.tool.ts:37
- Approved-only counts; superseded variants hidden (knowledge-source-mcp.repo.ts:149); paging clamped 0-200, batched queries; no writes; no rawText or embeddings returned.
END-OF-REPORT
