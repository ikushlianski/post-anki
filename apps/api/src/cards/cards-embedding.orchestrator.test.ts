import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./cards.repo.js", () => ({
  listCardVariantsForEmbeddingScan: vi.fn(),
  listCardVariantsForTopic: vi.fn(),
  updateCardVariantEmbedding: vi.fn(),
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(),
}));

const { listCardVariantsForEmbeddingScan, updateCardVariantEmbedding } = await import(
  "./cards.repo.js"
);
const { embedTexts } = await import("../shared/embeddings-client.js");
const { triggerCardEmbeddingScan } = await import("./cards-embedding.orchestrator.js");

describe("triggerCardEmbeddingScan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should report only the variants actually saved and count the rest as skipped", async () => {
    vi.mocked(listCardVariantsForEmbeddingScan).mockResolvedValue([
      { id: "v_a", prompt: "P A", answer: "A A", embeddingHash: null },
      { id: "v_b", prompt: "P B", answer: "A B", embeddingHash: null },
    ]);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "v_b", embedding: [2] }]);

    const result = await triggerCardEmbeddingScan();

    expect(updateCardVariantEmbedding).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false, skippedCount: 1 });
  });
});
