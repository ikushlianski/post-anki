import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashContent } from "@post-anki/core";

vi.mock("../shared/embeddings-client.js", () => ({ embedTexts: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./knowledge-bit-embedding.repo.js", () => ({
  listApprovedBitsForEmbedding: vi.fn(),
  listActiveVariantsForBitsEmbedding: vi.fn(),
  searchApprovedBitsByEmbedding: vi.fn(),
  updateKnowledgeBitEmbedding: vi.fn(),
}));
vi.mock("./knowledge-bit-question-variant.repo.js", () => ({
  updateQuestionVariantEmbedding: vi.fn(),
}));

const { LlmBudgetExceededError } = await import("../shared/spend-guard.js");
const { embedTexts } = await import("../shared/embeddings-client.js");
const repo = await import("./knowledge-bit-embedding.repo.js");
const { updateQuestionVariantEmbedding } = await import("./knowledge-bit-question-variant.repo.js");
const { embedApprovedKnowledgeBits, findSimilarApprovedKnowledgeBits } = await import(
  "./knowledge-bit-approval-embedding.orchestrator.js"
);

const bit = { id: "b1", body: "Fact body", embeddingHash: null, embeddedAt: null };
const variant = {
  id: "v1",
  prompt: "Q?",
  answer: "A",
  embeddingHash: null,
  embeddedAt: null,
};

describe("embedApprovedKnowledgeBits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(repo.listApprovedBitsForEmbedding).mockResolvedValue([bit]);
    vi.mocked(repo.listActiveVariantsForBitsEmbedding).mockResolvedValue([variant]);
    vi.mocked(embedTexts).mockImplementation(async (items) =>
      items.map((item) => ({ id: item.id, embedding: [0.1, 0.2] })),
    );
  });

  it("should embed a freshly approved piece and its active variants", async () => {
    await embedApprovedKnowledgeBits(["b1"]);

    expect(repo.updateKnowledgeBitEmbedding).toHaveBeenCalledWith(
      "b1",
      [0.1, 0.2],
      hashContent("Fact body"),
      "Fact body",
    );
    expect(updateQuestionVariantEmbedding).toHaveBeenCalledWith(
      "v1",
      [0.1, 0.2],
      hashContent("Q?\nA"),
    );
  });

  it("should not pay for content whose stored hash is unchanged", async () => {
    vi.mocked(repo.listApprovedBitsForEmbedding).mockResolvedValue([
      { ...bit, embeddingHash: hashContent("Fact body"), embeddedAt: new Date() },
    ]);
    vi.mocked(repo.listActiveVariantsForBitsEmbedding).mockResolvedValue([
      { ...variant, embeddingHash: hashContent("Q?\nA"), embeddedAt: new Date() },
    ]);

    await embedApprovedKnowledgeBits(["b1"]);

    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("should never fail the approval when the embeddings call errors", async () => {
    vi.mocked(embedTexts).mockRejectedValue(new Error("budget exceeded"));

    await expect(embedApprovedKnowledgeBits(["b1"])).resolves.toBeUndefined();

    expect(repo.updateKnowledgeBitEmbedding).not.toHaveBeenCalled();
    expect(updateQuestionVariantEmbedding).not.toHaveBeenCalled();
  });

  it("a spend-limit stop leaves the card unembedded for the scan and does not throw", async () => {
    vi.mocked(embedTexts).mockRejectedValue(new LlmBudgetExceededError(1, 1));

    await expect(embedApprovedKnowledgeBits(["b1"])).resolves.toBeUndefined();

    expect(updateQuestionVariantEmbedding).not.toHaveBeenCalled();
  });

  it("a bit-embedding failure does not stop its cards from being embedded", async () => {
    vi.mocked(embedTexts)
      .mockRejectedValueOnce(new Error("bit step down"))
      .mockImplementationOnce(async (items) =>
        items.map((item) => ({ id: item.id, embedding: [0.1, 0.2] })),
      );

    await embedApprovedKnowledgeBits(["b1"]);

    expect(repo.updateKnowledgeBitEmbedding).not.toHaveBeenCalled();
    expect(updateQuestionVariantEmbedding).toHaveBeenCalledWith(
      "v1",
      [0.1, 0.2],
      hashContent("Q?\nA"),
    );
  });

  it("should never fail the approval when the database lookup errors", async () => {
    vi.mocked(repo.listApprovedBitsForEmbedding).mockRejectedValue(new Error("db down"));

    await expect(embedApprovedKnowledgeBits(["b1"])).resolves.toBeUndefined();
  });
});

describe("findSimilarApprovedKnowledgeBits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should search approved pieces using the embedded query text", async () => {
    vi.mocked(embedTexts).mockResolvedValue([{ id: "query", embedding: [1, 0] }]);
    vi.mocked(repo.searchApprovedBitsByEmbedding).mockResolvedValue([
      { id: "b1", body: "Fact body", similarity: 0.9 },
    ]);

    const result = await findSimilarApprovedKnowledgeBits("fact", 5, 0.5);

    expect(repo.searchApprovedBitsByEmbedding).toHaveBeenCalledWith([1, 0], 5, 0.5, undefined);
    expect(result).toEqual([{ id: "b1", body: "Fact body", similarity: 0.9 }]);
  });

  it("should restrict the search to one subject when a subject is given", async () => {
    vi.mocked(embedTexts).mockResolvedValue([{ id: "query", embedding: [1, 0] }]);
    vi.mocked(repo.searchApprovedBitsByEmbedding).mockResolvedValue([]);

    await findSimilarApprovedKnowledgeBits("fact", 5, 0.5, "subj_1");

    expect(repo.searchApprovedBitsByEmbedding).toHaveBeenCalledWith([1, 0], 5, 0.5, "subj_1");
  });

  it("should return nothing when the query could not be embedded", async () => {
    vi.mocked(embedTexts).mockResolvedValue([]);

    expect(await findSimilarApprovedKnowledgeBits("fact", 5)).toEqual([]);
  });
});
