import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./facts.repo.js", () => ({
  listFactsForEmbeddingScan: vi.fn(),
  updateFactEmbedding: vi.fn(),
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(),
}));

const { listFactsForEmbeddingScan, updateFactEmbedding } = await import("./facts.repo.js");
const { embedTexts } = await import("../shared/embeddings-client.js");
const { embedFacts } = await import("./facts-embedding.orchestrator.js");

describe("embedFacts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should report only the facts actually saved and count the rest as skipped", async () => {
    vi.mocked(listFactsForEmbeddingScan).mockResolvedValue([
      { id: "f_a", body: "Fact A", embeddingHash: null },
      { id: "f_b", body: "Fact B", embeddingHash: null },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "f_a", embedding: [1] }]);

    const result = await embedFacts();

    expect(updateFactEmbedding).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false, skippedCount: 1 });
  });

  it("should omit skippedCount when every fact was saved", async () => {
    vi.mocked(listFactsForEmbeddingScan).mockResolvedValue([
      { id: "f_a", body: "Fact A", embeddingHash: null },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "f_a", embedding: [1] }]);

    const result = await embedFacts();

    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false });
  });
});
