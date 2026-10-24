import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getKnowledgeSourceForMcp,
  listActiveVariantsForBits,
  listApprovedBitsForSourcePage,
  type McpBitRow,
  type McpSourceRow,
} from "../knowledge-source/knowledge-source-mcp.repo.js";

vi.mock("../knowledge-source/knowledge-source-mcp.repo.js", () => ({
  getKnowledgeSourceForMcp: vi.fn(),
  listActiveVariantsForBits: vi.fn(),
  listApprovedBitsForSourcePage: vi.fn(),
}));

const { getSourceKnowledgeBits, GET_SOURCE_KNOWLEDGE_BITS_MAX_LIMIT } = await import(
  "./get-source-knowledge-bits.tool.js"
);

afterEach(() => {
  vi.clearAllMocks();
});

const source: McpSourceRow = {
  id: "src_1",
  kind: "prose",
  rawText: "text",
  summary: null,
  sourceUrl: null,
  subjectId: null,
  status: "detected",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function makeBit(overrides: Partial<McpBitRow> = {}): McpBitRow {
  return {
    id: "bit_1",
    knowledgeSourceId: "src_1",
    body: "A closure keeps its scope alive.",
    background: null,
    sourceLinks: null,
    topicId: null,
    approvalState: "approved",
    ...overrides,
  };
}

describe("getSourceKnowledgeBits", () => {
  it("should return a not_found tag for an unknown source without reading bits", async () => {
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(null);

    const result = await getSourceKnowledgeBits({ sourceId: "src_missing" });

    expect(result).toEqual({ error: "not_found" });
    expect(listApprovedBitsForSourcePage).not.toHaveBeenCalled();
  });

  it("should return each approved bit with its active questions grouped under it", async () => {
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(source);
    vi.mocked(listApprovedBitsForSourcePage).mockResolvedValue({
      rows: [
        makeBit({ sourceLinks: ["https://example.com"], topicId: "top_1", background: "ctx" }),
        makeBit({ id: "bit_2" }),
      ],
      total: 2,
    });
    vi.mocked(listActiveVariantsForBits).mockResolvedValue([
      { knowledgeBitId: "bit_1", kind: "wh_question", prompt: "What?", answer: "That.", sentence: null },
      { knowledgeBitId: "bit_1", kind: "fill_in_the_blank", prompt: "A ___", answer: "closure", sentence: "A closure." },
    ]);

    const result = await getSourceKnowledgeBits({ sourceId: "src_1" });

    expect(result).toEqual({
      items: [
        {
          id: "bit_1",
          body: "A closure keeps its scope alive.",
          background: "ctx",
          sourceLinks: ["https://example.com"],
          topicId: "top_1",
          questions: [
            { kind: "wh_question", prompt: "What?", answer: "That.", sentence: null },
            { kind: "fill_in_the_blank", prompt: "A ___", answer: "closure", sentence: "A closure." },
          ],
        },
        {
          id: "bit_2",
          body: "A closure keeps its scope alive.",
          background: null,
          sourceLinks: [],
          topicId: null,
          questions: [],
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
    expect(listActiveVariantsForBits).toHaveBeenCalledWith(["bit_1", "bit_2"]);
  });

  it("should page with the requested limit and offset and clamp a limit above 200", async () => {
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(source);
    vi.mocked(listApprovedBitsForSourcePage).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(listActiveVariantsForBits).mockResolvedValue([]);

    await getSourceKnowledgeBits({ sourceId: "src_1", limit: 3, offset: 4 });
    expect(listApprovedBitsForSourcePage).toHaveBeenLastCalledWith("src_1", 3, 4);

    const result = await getSourceKnowledgeBits({ sourceId: "src_1", limit: 5000 });

    expect(result).toMatchObject({ limit: GET_SOURCE_KNOWLEDGE_BITS_MAX_LIMIT });
    expect(listApprovedBitsForSourcePage).toHaveBeenLastCalledWith("src_1", 200, 0);
  });
});
