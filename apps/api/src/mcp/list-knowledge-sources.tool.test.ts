import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listKnowledgeSourcesPage,
  type McpSourceListRow,
} from "../knowledge-source/knowledge-source-mcp.repo.js";

vi.mock("../knowledge-source/knowledge-source-mcp.repo.js", () => ({
  listKnowledgeSourcesPage: vi.fn(),
}));

const { listKnowledgeSources, LIST_KNOWLEDGE_SOURCES_MAX_LIMIT } = await import(
  "./list-knowledge-sources.tool.js"
);

afterEach(() => {
  vi.clearAllMocks();
});

function makeRow(overrides: Partial<McpSourceListRow> = {}): McpSourceListRow {
  return {
    id: "src_1",
    kind: "prose",
    rawText: "Closures capture their scope.",
    summary: null,
    sourceUrl: null,
    subjectId: "sub_1",
    status: "detected",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    approvedBitCount: 3,
    ...overrides,
  };
}

describe("listKnowledgeSources", () => {
  it("should map each source to its label, link, status and approved bit count", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockResolvedValue({
      rows: [
        makeRow(),
        makeRow({ id: "src_2", summary: "Article summary", sourceUrl: "https://example.com/a", approvedBitCount: 0 }),
      ],
      total: 2,
    });

    const result = await listKnowledgeSources({});

    expect(result).toEqual({
      items: [
        {
          id: "src_1",
          kind: "prose",
          label: "Closures capture their scope.",
          sourceUrl: null,
          subjectId: "sub_1",
          status: "detected",
          createdAt: "2026-01-01T00:00:00.000Z",
          approvedBitCount: 3,
        },
        {
          id: "src_2",
          kind: "prose",
          label: "Article summary",
          sourceUrl: "https://example.com/a",
          subjectId: "sub_1",
          status: "detected",
          createdAt: "2026-01-01T00:00:00.000Z",
          approvedBitCount: 0,
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
  });

  it("should pass the subject filter and the requested page through to the query", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockResolvedValue({ rows: [], total: 0 });

    await listKnowledgeSources({ subjectId: "sub_9", limit: 3, offset: 4 });

    expect(listKnowledgeSourcesPage).toHaveBeenCalledWith({ subjectId: "sub_9", limit: 3, offset: 4 });
  });

  it("should clamp a limit above 200 to 200 instead of rejecting it", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockResolvedValue({ rows: [], total: 0 });

    const result = await listKnowledgeSources({ limit: 5000 });

    expect(result.limit).toBe(LIST_KNOWLEDGE_SOURCES_MAX_LIMIT);
    expect(listKnowledgeSourcesPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it("should treat a negative offset as zero", async () => {
    vi.mocked(listKnowledgeSourcesPage).mockResolvedValue({ rows: [], total: 0 });

    const result = await listKnowledgeSources({ offset: -5 });

    expect(result.offset).toBe(0);
  });
});
