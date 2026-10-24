import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashContent } from "@post-anki/core";

vi.mock("./knowledge-bit-embedding.repo.js", () => ({
  listKnowledgeBitsForEmbeddingScan: vi.fn(),
  updateKnowledgeBitEmbedding: vi.fn(),
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(),
}));

const { listKnowledgeBitsForEmbeddingScan, updateKnowledgeBitEmbedding } = await import(
  "./knowledge-bit-embedding.repo.js"
);
const { embedTexts } = await import("../shared/embeddings-client.js");
const { embedKnowledgeBits } = await import("./knowledge-bit-embedding.orchestrator.js");

describe("embedKnowledgeBits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should embed and store a knowledge bit that has no embedding yet", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value", embeddingHash: null };

    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue([bit]);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "kb_1", embedding: [1, 2, 3] }]);

    const result = await embedKnowledgeBits();

    expect(embedTexts).toHaveBeenCalledWith([{ id: "kb_1", text: bit.body }]);
    expect(updateKnowledgeBitEmbedding).toHaveBeenCalledWith(
      "kb_1",
      [1, 2, 3],
      hashContent(bit.body),
      bit.body,
    );
    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false });
  });

  it("should skip a knowledge bit whose stored hash already matches its current body", async () => {
    const body = "Retention beats acquisition";
    const bit = { id: "kb_2", body, embeddingHash: hashContent(body) };

    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue([bit]);
    vi.mocked(embedTexts).mockResolvedValue([]);

    const result = await embedKnowledgeBits();

    expect(embedTexts).not.toHaveBeenCalled();
    expect(updateKnowledgeBitEmbedding).not.toHaveBeenCalled();
    expect(result).toEqual({ embeddedCount: 0, reusedCount: 1, capped: false });
  });

  it("should cap the batch at the embedding cap and report capped true", async () => {
    const bits = Array.from({ length: 210 }, (_, i) => ({
      id: `kb_${i}`,
      body: `Body ${i}`,
      embeddingHash: null,
    }));

    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue(bits);
    vi.mocked(embedTexts).mockResolvedValue(
      bits.slice(0, 200).map((bit) => ({ id: bit.id, embedding: [1] })),
    );

    const result = await embedKnowledgeBits();

    expect(vi.mocked(embedTexts).mock.calls[0]![0]).toHaveLength(200);
    expect(result.embeddedCount).toBe(200);
    expect(result.capped).toBe(true);
  });

  it("should request at least the embedding cap's worth of candidates per scan", async () => {
    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue([]);
    vi.mocked(embedTexts).mockResolvedValue([]);

    await embedKnowledgeBits();

    const requestedLimit = vi.mocked(listKnowledgeBitsForEmbeddingScan).mock.calls[0]![0];
    expect(requestedLimit).toBeGreaterThanOrEqual(200);
  });

  it("should write each embedding back to its own bit even when results return out of order", async () => {
    const bitA = { id: "kb_a", body: "Body A", embeddingHash: null };
    const bitB = { id: "kb_b", body: "Body B", embeddingHash: null };

    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue([bitA, bitB]);
    vi.mocked(embedTexts).mockResolvedValue([
      { id: "kb_b", embedding: [2, 2, 2] },
      { id: "kb_a", embedding: [1, 1, 1] },
    ]);

    await embedKnowledgeBits();

    expect(updateKnowledgeBitEmbedding).toHaveBeenCalledWith(
      "kb_b",
      [2, 2, 2],
      hashContent(bitB.body),
      bitB.body,
    );
    expect(updateKnowledgeBitEmbedding).toHaveBeenCalledWith(
      "kb_a",
      [1, 1, 1],
      hashContent(bitA.body),
      bitA.body,
    );
  });

  it("should propagate an embedTexts failure without writing any embedding back", async () => {
    const bit = { id: "kb_1", body: "Body", embeddingHash: null };

    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue([bit]);
    vi.mocked(embedTexts).mockRejectedValue(new Error("embedding provider unavailable"));

    await expect(embedKnowledgeBits()).rejects.toThrow("embedding provider unavailable");
    expect(updateKnowledgeBitEmbedding).not.toHaveBeenCalled();
  });

  it("should report only the bits actually saved and count the rest as skipped", async () => {
    const bits = [
      { id: "kb_a", body: "Body A", embeddingHash: null },
      { id: "kb_b", body: "Body B", embeddingHash: null },
    ];

    vi.mocked(listKnowledgeBitsForEmbeddingScan).mockResolvedValue(bits);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "kb_a", embedding: [1] }]);

    const result = await embedKnowledgeBits();

    expect(updateKnowledgeBitEmbedding).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false, skippedCount: 1 });
  });
});
