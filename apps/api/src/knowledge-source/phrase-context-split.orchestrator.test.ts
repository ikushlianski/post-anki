import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js", () => ({
  embedApprovedKnowledgeBits: vi.fn(),
}));
vi.mock("./phrase-sentence-backfill.repo.js", () => ({ applyPhraseContextSplits: vi.fn() }));

const { embedApprovedKnowledgeBits } = await import("../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js");
const { applyPhraseContextSplits } = await import("./phrase-sentence-backfill.repo.js");
const { splitPhraseContextsAndRefreshEmbeddings } = await import("./phrase-context-split.orchestrator.js");

const splits = [
  { variantId: "v1", bitId: "b1", prompt: "Formal", context: "To a manager" },
  { variantId: "v2", bitId: "b1", prompt: "Casual", context: "To a friend" },
  { variantId: "v3", bitId: "b2", prompt: "Formal", context: "To a client" },
];

describe("splitPhraseContextsAndRefreshEmbeddings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(applyPhraseContextSplits).mockResolvedValue(3);
  });

  it("should ask for fresh duplicate-check vectors once per affected card after a split", async () => {
    await expect(splitPhraseContextsAndRefreshEmbeddings(splits)).resolves.toBe(3);

    expect(embedApprovedKnowledgeBits).toHaveBeenCalledTimes(1);
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["b1", "b2"]);
  });

  it("should keep the split result when refreshing the vectors fails", async () => {
    vi.mocked(embedApprovedKnowledgeBits).mockRejectedValue(new Error("embeddings down"));

    await expect(splitPhraseContextsAndRefreshEmbeddings(splits)).resolves.toBe(3);
  });

  it("should not request a refresh when nothing was split", async () => {
    vi.mocked(applyPhraseContextSplits).mockResolvedValue(0);

    await splitPhraseContextsAndRefreshEmbeddings(splits);

    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should not refresh vectors when the split itself fails", async () => {
    vi.mocked(applyPhraseContextSplits).mockRejectedValue(new Error("db down"));

    await expect(splitPhraseContextsAndRefreshEmbeddings(splits)).rejects.toThrow("db down");

    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });
});
