import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getKnowledgeBitForMcp,
  getKnowledgeSourceForMcp,
  listActiveVariantsForBits,
  type McpBitRow,
} from "../knowledge-source/knowledge-source-mcp.repo.js";

vi.mock("../knowledge-source/knowledge-source-mcp.repo.js", () => ({
  getKnowledgeBitForMcp: vi.fn(),
  getKnowledgeSourceForMcp: vi.fn(),
  listActiveVariantsForBits: vi.fn(),
}));

const { getKnowledgeBit } = await import("./get-knowledge-bit.tool.js");

afterEach(() => {
  vi.clearAllMocks();
});

const bit: McpBitRow = {
  id: "bit_1",
  knowledgeSourceId: "src_1",
  body: "Raft elects one leader per term.",
  background: "ctx",
  sourceLinks: ["https://example.com"],
  topicId: "top_1",
  approvalState: "pending",
};

describe("getKnowledgeBit", () => {
  it("should return a not_found tag for an unknown bit id", async () => {
    vi.mocked(getKnowledgeBitForMcp).mockResolvedValue(null);

    const result = await getKnowledgeBit({ id: "bit_missing" });

    expect(result).toEqual({ error: "not_found" });
    expect(listActiveVariantsForBits).not.toHaveBeenCalled();
  });

  it("should return a pending bit labelled with its approval state, its source and its questions", async () => {
    vi.mocked(getKnowledgeBitForMcp).mockResolvedValue(bit);
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue({
      id: "src_1",
      kind: "url",
      rawText: "raw",
      summary: "Raft notes",
      sourceUrl: "https://example.com/raft",
      subjectId: null,
      status: "detected",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    vi.mocked(listActiveVariantsForBits).mockResolvedValue([
      { knowledgeBitId: "bit_1", kind: "basic", prompt: "Who leads?", answer: "The leader.", sentence: null },
    ]);

    const result = await getKnowledgeBit({ id: "bit_1" });

    expect(result).toEqual({
      id: "bit_1",
      body: "Raft elects one leader per term.",
      background: "ctx",
      sourceLinks: ["https://example.com"],
      topicId: "top_1",
      approvalState: "pending",
      source: { id: "src_1", label: "Raft notes", sourceUrl: "https://example.com/raft" },
      questions: [{ kind: "basic", prompt: "Who leads?", answer: "The leader.", sentence: null }],
    });
  });

  it("should still return the bit with a null source when its source row is gone", async () => {
    vi.mocked(getKnowledgeBitForMcp).mockResolvedValue({ ...bit, sourceLinks: null });
    vi.mocked(getKnowledgeSourceForMcp).mockResolvedValue(null);
    vi.mocked(listActiveVariantsForBits).mockResolvedValue([]);

    const result = await getKnowledgeBit({ id: "bit_1" });

    expect(result).toMatchObject({ source: null, sourceLinks: [], questions: [] });
  });
});
