import { beforeEach, describe, expect, it, vi } from "vitest";

const lists = {
  embed: vi.fn(),
  tag: vi.fn(),
  wh: vi.fn(),
  fill: vi.fn(),
  basic: vi.fn(),
  variantEmbed: vi.fn(),
};

vi.mock("./knowledge-bit-embedding.repo.js", () => ({
  listKnowledgeBitsForEmbeddingScan: (...a: unknown[]) => lists.embed(...a),
}));
vi.mock("./knowledge-bit-tagging.repo.js", () => ({
  listKnowledgeBitsForTaggingScan: (...a: unknown[]) => lists.tag(...a),
}));
vi.mock("./knowledge-bit-wh-question-claim.repo.js", () => ({
  listKnowledgeBitsForWhQuestionGenerationScan: (...a: unknown[]) => lists.wh(...a),
}));
vi.mock("./knowledge-bit-fill-blank-claim.repo.js", () => ({
  listKnowledgeBitsForFillBlankGenerationScan: (...a: unknown[]) => lists.fill(...a),
}));
vi.mock("./knowledge-bit-basic-card-claim.repo.js", () => ({
  listKnowledgeBitsForBasicCardGenerationScan: (...a: unknown[]) => lists.basic(...a),
}));
vi.mock("./knowledge-bit-question-variant.repo.js", () => ({
  listQuestionVariantsForEmbeddingScan: (...a: unknown[]) => lists.variantEmbed(...a),
}));

const { hasPendingBitWork } = await import("./pipeline-pending-work.js");

describe("hasPendingBitWork", () => {
  beforeEach(() => {
    for (const fn of Object.values(lists)) {
      fn.mockReset().mockResolvedValue([]);
    }
  });

  it("should report no work when every list is empty so the sweep stays silent", async () => {
    await expect(hasPendingBitWork()).resolves.toBe(false);
    expect(lists.embed).toHaveBeenCalledWith(1);
  });

  it("should report work when one list has a row so the sweep sends a kick", async () => {
    lists.variantEmbed.mockResolvedValue([{ id: "v1" }]);

    await expect(hasPendingBitWork()).resolves.toBe(true);
  });
});
