import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit-approval-embedding.orchestrator.js", () => ({
  embedApprovedKnowledgeBits: vi.fn(),
}));

vi.mock("../card-triage/style-notes-loader.js", () => ({
  loadStyleNotesBlocksForBits: vi.fn(),
}));

const { embedApprovedKnowledgeBits } = await import("./knowledge-bit-approval-embedding.orchestrator.js");
const { loadStyleNotesBlocksForBits } = await import("../card-triage/style-notes-loader.js");

vi.mock("./knowledge-bit-fill-blank-claim.repo.js", () => ({
  listKnowledgeBitsForFillBlankGenerationScan: vi.fn(),
  recordGeneratedFillBlankVariant: vi.fn(),
  markFillBlankGenerationFailed: vi.fn(),
  claimKnowledgeBitForFillBlankGeneration: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-fill-blank-generator.agent.js", () => ({
  runKnowledgeBitFillBlankGenerator: vi.fn(),
}));

const {
  listKnowledgeBitsForFillBlankGenerationScan,
  recordGeneratedFillBlankVariant,
  markFillBlankGenerationFailed,
  claimKnowledgeBitForFillBlankGeneration,
} = await import("./knowledge-bit-fill-blank-claim.repo.js");
const { runKnowledgeBitFillBlankGenerator } = await import(
  "../mastra/knowledge-bit-fill-blank-generator.agent.js"
);
const { generateKnowledgeBitFillBlanks, FILL_BLANK_GENERATION_CAP } = await import(
  "./knowledge-bit-fill-blank-generation.orchestrator.js"
);

const FAKE_CLAIM_TOKEN = "fbgc_fake_claim_token";

describe("generateKnowledgeBitFillBlanks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadStyleNotesBlocksForBits).mockResolvedValue(new Map());
    vi.mocked(claimKnowledgeBitForFillBlankGeneration).mockResolvedValue(FAKE_CLAIM_TOKEN);
  });

  it("should record a fill_in_the_blank variant (insert + mark, in one call) on success", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_1",
      "fill_in_the_blank",
      0,
      "An initial price ____ shifts what feels fair later.",
      "anchor",
      FAKE_CLAIM_TOKEN,
      undefined,
      "An initial price anchor shifts what feels fair later.",
    );
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0, skipped: 0 });
  });

  it("should hand each bit its own style notes block when the learner has notes", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };
    const block = "<style_notes>\n- short wording\n</style_notes>";

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(loadStyleNotesBlocksForBits).mockResolvedValue(new Map([["kb_1", block]]));
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "A price anchor shifts what feels fair.",
      prompt: "A price ____ shifts what feels fair.",
      answer: "anchor",
    });

    await generateKnowledgeBitFillBlanks();

    expect(loadStyleNotesBlocksForBits).toHaveBeenCalledWith(["kb_1"]);
    expect(runKnowledgeBitFillBlankGenerator).toHaveBeenCalledWith(bit.body, block);
  });

  it("should hand an empty style notes block to a bit that has none", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "A price anchor shifts what feels fair.",
      prompt: "A price ____ shifts what feels fair.",
      answer: "anchor",
    });

    await generateKnowledgeBitFillBlanks();

    expect(runKnowledgeBitFillBlankGenerator).toHaveBeenCalledWith(bit.body, "");
  });

  it("should skip a bit without calling the agent when a concurrent scan already claimed it", async () => {
    const bit = { id: "kb_claimed_elsewhere", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(claimKnowledgeBitForFillBlankGeneration).mockResolvedValue(null);

    const result = await generateKnowledgeBitFillBlanks();

    expect(claimKnowledgeBitForFillBlankGeneration).toHaveBeenCalledWith("kb_claimed_elsewhere", "Some content", {});
    expect(runKnowledgeBitFillBlankGenerator).not.toHaveBeenCalled();
    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 0, skipped: 1 });
  });

  it("should claim each bit independently, so one lost claim doesn't stop the next bit from generating", async () => {
    const claimedElsewhere = { id: "kb_claimed_elsewhere", body: "Some content" };
    const ownBit = { id: "kb_own", body: "Other content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([claimedElsewhere, ownBit]);
    vi.mocked(claimKnowledgeBitForFillBlankGeneration)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(FAKE_CLAIM_TOKEN);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "This fact matters.",
      prompt: "This ____ matters.",
      answer: "fact",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_own",
      "fill_in_the_blank",
      0,
      "This ____ matters.",
      "fact",
      FAKE_CLAIM_TOKEN,
      undefined,
      "This fact matters.",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 0, skipped: 1 });
  });

  it("should mark a bit failed when the agent throws, and continue processing the next bit", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ sentence: "This fact matters.", prompt: "This ____ matters.", answer: "fact" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_fail", FAKE_CLAIM_TOKEN);
    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_next",
      "fill_in_the_blank",
      0,
      "This ____ matters.",
      "fact",
      FAKE_CLAIM_TOKEN,
      undefined,
      "This fact matters.",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the transactional insert+mark write itself throws", async () => {
    const bit = { id: "kb_txn_fail", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "This fact matters.",
      prompt: "This ____ matters.",
      answer: "fact",
    });
    vi.mocked(recordGeneratedFillBlankVariant).mockRejectedValueOnce(new Error("db write failed"));

    const result = await generateKnowledgeBitFillBlanks();

    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_txn_fail", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should cap the scan's batch size, leaving remainder bits unprocessed this call", async () => {
    const bits = Array.from({ length: FILL_BLANK_GENERATION_CAP + 10 }, (_, i) => ({
      id: `kb_${i}`,
      body: `Body ${i}`,
    }));

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockImplementation(async (limit: number) =>
      bits.slice(0, limit),
    );
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "This fact matters.",
      prompt: "This ____ matters.",
      answer: "fact",
    });

    const result = await generateKnowledgeBitFillBlanks();

    const requestedLimit = vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mock.calls[0]![0];

    expect(requestedLimit).toBe(FILL_BLANK_GENERATION_CAP);
    expect(result.scanned).toBe(FILL_BLANK_GENERATION_CAP);
    expect(runKnowledgeBitFillBlankGenerator).toHaveBeenCalledTimes(FILL_BLANK_GENERATION_CAP);
  });

  it("should never let a markFillBlankGenerationFailed write failure abort the rest of the batch", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ sentence: "This fact matters.", prompt: "This ____ matters.", answer: "fact" });
    vi.mocked(markFillBlankGenerationFailed).mockRejectedValueOnce(new Error("db write failed"));

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_next",
      "fill_in_the_blank",
      0,
      "This ____ matters.",
      "fact",
      FAKE_CLAIM_TOKEN,
      undefined,
      "This fact matters.",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1, skipped: 0 });
  });
});

describe("generateKnowledgeBitFillBlanks language guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadStyleNotesBlocksForBits).mockResolvedValue(new Map());
    vi.mocked(claimKnowledgeBitForFillBlankGeneration).mockResolvedValue(FAKE_CLAIM_TOKEN);
  });

  it("should never store a fill-in-the-blank written in a different script than its bit and should mark the bit failed", async () => {
    const englishBit = { id: "kb_ribosome", body: "Ribosomes synthesize proteins." };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([englishBit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "核糖体 合成蛋白质。",
      prompt: "____ 合成蛋白质。",
      answer: "核糖体",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_ribosome", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });
});

describe("generateKnowledgeBitFillBlanks concurrency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadStyleNotesBlocksForBits).mockResolvedValue(new Map());
    vi.mocked(claimKnowledgeBitForFillBlankGeneration).mockResolvedValue(FAKE_CLAIM_TOKEN);
  });

  it("should keep at most four bits in flight at once and still generate every bit", async () => {
    const bits = Array.from({ length: 6 }, (_, index) => ({
      id: `kb_${index}`,
      body: "Price anchors shape perceived value",
    }));
    let inFlight = 0;
    let maxInFlight = 0;

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue(bits);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;

      return { sentence: "This fact matters.", prompt: "This ____ matters.", answer: "fact" };
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(maxInFlight).toBe(4);
    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledTimes(6);
    expect(result).toEqual({ scanned: 6, generated: 6, failed: 0, skipped: 0 });
  });
});

describe("generateKnowledgeBitFillBlanks embedding", () => {
  const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadStyleNotesBlocksForBits).mockResolvedValue(new Map());
    vi.mocked(claimKnowledgeBitForFillBlankGeneration).mockResolvedValue(FAKE_CLAIM_TOKEN);
    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
    });
  });

  it("a newly generated card becomes searchable without waiting for the scan", async () => {
    vi.mocked(recordGeneratedFillBlankVariant).mockImplementation(async () => {
      expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
    });

    await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledTimes(1);
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledTimes(1);
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
  });

  it("an embedding outage does not lose the generated card", async () => {
    vi.mocked(embedApprovedKnowledgeBits).mockRejectedValue(new Error("embeddings down"));

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledTimes(1);
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0, skipped: 0 });
  });

  it("a bit whose card could not be generated is not sent for embedding", async () => {
    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockRejectedValue(new Error("provider down"));

    await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });
});
