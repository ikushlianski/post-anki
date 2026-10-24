import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSourcesForDuplicateScan,
  updateSourceEmbedding,
  type SourceForDuplicateScan,
} from "../content-library/content-library.repo.js";
import { embedSourceTexts } from "./embeddings-client.js";
import { triggerSourceDuplicateScan } from "./source-duplicate.orchestrator.js";

vi.mock("../content-library/content-library.repo.js", () => ({
  listSourcesForDuplicateScan: vi.fn(),
  updateSourceEmbedding: vi.fn(),
}));
vi.mock("../mastra/mastra.js", () => ({ startTracingSpan: vi.fn(() => undefined) }));
vi.mock("./embeddings-client.js", () => ({ embedSourceTexts: vi.fn() }));
vi.mock("./source-duplicate-pairs.repo.js", () => ({
  findSimilarSourcePairs: vi.fn(async () => []),
}));
vi.mock("./source-duplicate.repo.js", () => ({
  insertSourceDuplicateSuggestionIfNew: vi.fn(async () => null),
}));

function textSource(id: string): SourceForDuplicateScan {
  return {
    id,
    kind: "text",
    value: `note ${id}`,
    title: `Title ${id}`,
    fetchedText: `Body of ${id}`,
    embeddingHash: null,
  };
}

describe("triggerSourceDuplicateScan embedding counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSourcesForDuplicateScan).mockResolvedValue([
      textSource("a"),
      textSource("b"),
      textSource("c"),
    ]);
  });

  it("should report only the saved sources as embedded and the rest as skipped when the client returns fewer results than sent", async () => {
    vi.mocked(embedSourceTexts).mockResolvedValue([
      { id: "a", embedding: [1, 0, 0] },
      { id: "b", embedding: [0, 1, 0] },
    ]);

    const result = await triggerSourceDuplicateScan();

    expect(result.embeddedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(updateSourceEmbedding).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateSourceEmbedding).mock.calls.map((call) => call[0])).toEqual(["a", "b"]);
  });

  it("should omit skippedCount when every source sent was saved", async () => {
    vi.mocked(embedSourceTexts).mockResolvedValue([
      { id: "a", embedding: [1, 0, 0] },
      { id: "b", embedding: [0, 1, 0] },
      { id: "c", embedding: [0, 0, 1] },
    ]);

    const result = await triggerSourceDuplicateScan();

    expect(result.embeddedCount).toBe(3);
    expect(result).not.toHaveProperty("skippedCount");
    expect(updateSourceEmbedding).toHaveBeenCalledTimes(3);
  });
});
