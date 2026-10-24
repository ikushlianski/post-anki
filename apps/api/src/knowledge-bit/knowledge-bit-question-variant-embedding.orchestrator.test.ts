import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashContent } from "@post-anki/core";

vi.mock("./knowledge-bit-question-variant.repo.js", () => ({
  listQuestionVariantsForEmbeddingScan: vi.fn(),
  updateQuestionVariantEmbedding: vi.fn(),
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(),
}));

const { listQuestionVariantsForEmbeddingScan, updateQuestionVariantEmbedding } = await import(
  "./knowledge-bit-question-variant.repo.js"
);
const { embedTexts } = await import("../shared/embeddings-client.js");
const { embedKnowledgeBitQuestionVariants } = await import(
  "./knowledge-bit-question-variant-embedding.orchestrator.js"
);

function textOf(prompt: string, answer: string): string {
  return `${prompt}\n${answer}`;
}

describe("embedKnowledgeBitQuestionVariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should embed and store a question variant that has no embedding yet", async () => {
    const variant = {
      id: "kbqv_1",
      prompt: "Why does price anchoring shape perceived value?",
      answer: "Because the first number seen recalibrates the comparison baseline",
      embeddingHash: null,
    };

    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue([variant]);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "kbqv_1", embedding: [1, 2, 3] }]);

    const result = await embedKnowledgeBitQuestionVariants();

    expect(embedTexts).toHaveBeenCalledWith([
      { id: "kbqv_1", text: textOf(variant.prompt, variant.answer) },
    ]);
    expect(updateQuestionVariantEmbedding).toHaveBeenCalledWith(
      "kbqv_1",
      [1, 2, 3],
      hashContent(textOf(variant.prompt, variant.answer)),
    );
    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false });
  });

  it("should skip a variant whose stored hash already matches its current prompt/answer", async () => {
    const prompt = "What breaks when retention drops?";
    const answer = "Acquisition spend stops compounding";
    const variant = {
      id: "kbqv_2",
      prompt,
      answer,
      embeddingHash: hashContent(textOf(prompt, answer)),
    };

    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue([variant]);
    vi.mocked(embedTexts).mockResolvedValue([]);

    const result = await embedKnowledgeBitQuestionVariants();

    expect(embedTexts).not.toHaveBeenCalled();
    expect(updateQuestionVariantEmbedding).not.toHaveBeenCalled();
    expect(result).toEqual({ embeddedCount: 0, reusedCount: 1, capped: false });
  });

  it("should cap the batch at the embedding cap and report capped true", async () => {
    const variants = Array.from({ length: 210 }, (_, i) => ({
      id: `kbqv_${i}`,
      prompt: `Prompt ${i}`,
      answer: `Answer ${i}`,
      embeddingHash: null,
    }));

    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue(variants);
    vi.mocked(embedTexts).mockResolvedValue(
      variants.slice(0, 200).map((variant) => ({ id: variant.id, embedding: [1] })),
    );

    const result = await embedKnowledgeBitQuestionVariants();

    expect(vi.mocked(embedTexts).mock.calls[0]![0]).toHaveLength(200);
    expect(result.embeddedCount).toBe(200);
    expect(result.capped).toBe(true);
  });

  it("should request at least the embedding cap's worth of candidates per scan", async () => {
    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue([]);
    vi.mocked(embedTexts).mockResolvedValue([]);

    await embedKnowledgeBitQuestionVariants();

    const requestedLimit = vi.mocked(listQuestionVariantsForEmbeddingScan).mock.calls[0]![0];
    expect(requestedLimit).toBeGreaterThanOrEqual(200);
  });

  it("should write each embedding back to its own variant even when results return out of order", async () => {
    const variantA = { id: "kbqv_a", prompt: "Prompt A", answer: "Answer A", embeddingHash: null };
    const variantB = { id: "kbqv_b", prompt: "Prompt B", answer: "Answer B", embeddingHash: null };

    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue([variantA, variantB]);
    vi.mocked(embedTexts).mockResolvedValue([
      { id: "kbqv_b", embedding: [2, 2, 2] },
      { id: "kbqv_a", embedding: [1, 1, 1] },
    ]);

    await embedKnowledgeBitQuestionVariants();

    expect(updateQuestionVariantEmbedding).toHaveBeenCalledWith(
      "kbqv_b",
      [2, 2, 2],
      hashContent(textOf(variantB.prompt, variantB.answer)),
    );
    expect(updateQuestionVariantEmbedding).toHaveBeenCalledWith(
      "kbqv_a",
      [1, 1, 1],
      hashContent(textOf(variantA.prompt, variantA.answer)),
    );
  });

  it("should propagate an embedTexts failure without writing any embedding back", async () => {
    const variant = { id: "kbqv_1", prompt: "Prompt", answer: "Answer", embeddingHash: null };

    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue([variant]);
    vi.mocked(embedTexts).mockRejectedValue(new Error("embedding provider unavailable"));

    await expect(embedKnowledgeBitQuestionVariants()).rejects.toThrow(
      "embedding provider unavailable",
    );
    expect(updateQuestionVariantEmbedding).not.toHaveBeenCalled();
  });

  it("should report only the variants actually saved and count the rest as skipped", async () => {
    const variants = [
      { id: "kbqv_a", prompt: "Prompt A", answer: "Answer A", embeddingHash: null },
      { id: "kbqv_b", prompt: "Prompt B", answer: "Answer B", embeddingHash: null },
    ];

    vi.mocked(listQuestionVariantsForEmbeddingScan).mockResolvedValue(variants);
    vi.mocked(embedTexts).mockResolvedValue([{ id: "kbqv_b", embedding: [2] }]);

    const result = await embedKnowledgeBitQuestionVariants();

    expect(updateQuestionVariantEmbedding).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ embeddedCount: 1, reusedCount: 0, capped: false, skippedCount: 1 });
  });
});
