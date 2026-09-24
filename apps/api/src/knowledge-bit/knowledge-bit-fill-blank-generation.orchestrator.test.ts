import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit-question-variant.repo.js", () => ({
  listKnowledgeBitsForFillBlankGenerationScan: vi.fn(),
  recordGeneratedFillBlankVariant: vi.fn(),
  markFillBlankGenerationFailed: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-fill-blank-generator.agent.js", () => ({
  runKnowledgeBitFillBlankGenerator: vi.fn(),
}));

const {
  listKnowledgeBitsForFillBlankGenerationScan,
  recordGeneratedFillBlankVariant,
  markFillBlankGenerationFailed,
} = await import("./knowledge-bit-question-variant.repo.js");
const { runKnowledgeBitFillBlankGenerator } = await import(
  "../mastra/knowledge-bit-fill-blank-generator.agent.js"
);
const { generateKnowledgeBitFillBlanks, FILL_BLANK_GENERATION_CAP } = await import(
  "./knowledge-bit-fill-blank-generation.orchestrator.js"
);

describe("generateKnowledgeBitFillBlanks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should record a fill_in_the_blank variant (insert + mark, in one call) on success", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
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
    );
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0 });
  });

  it("should mark a bit failed when the agent throws, and continue processing the next bit", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ prompt: "This ____ matters.", answer: "fact" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_fail");
    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_next",
      "fill_in_the_blank",
      0,
      "This ____ matters.",
      "fact",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1 });
  });

  it("should mark a bit failed when the agent returns a blank prompt or answer", async () => {
    const bit = { id: "kb_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({ prompt: "   ", answer: "an answer" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_blank");
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1 });
  });

  it("should mark a bit failed when the prompt has no ____ blank marker", async () => {
    const bit = { id: "kb_no_marker", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      prompt: "This sentence has no blank marker.",
      answer: "anchor",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_no_marker");
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1 });
  });

  it("should mark a bit failed when the prompt has more than one blank or an over-length run of underscores", async () => {
    const twoBlanksBit = { id: "kb_two_blanks", body: "Some content" };
    const longRunBit = { id: "kb_long_run", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([twoBlanksBit, longRunBit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockResolvedValueOnce({ prompt: "This ____ affects that ____.", answer: "anchor" })
      .mockResolvedValueOnce({ prompt: "This _____ matters.", answer: "anchor" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_two_blanks");
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_long_run");
    expect(result).toEqual({ scanned: 2, generated: 0, failed: 2 });
  });

  it("should accept a correctly-formed single blank even when the sentence also contains an unrelated single underscore", async () => {
    const bit = { id: "kb_stray_underscore", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      prompt: "The `max_connections` limit is enforced by ____.",
      answer: "the connection pool",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_stray_underscore",
      "fill_in_the_blank",
      0,
      "The `max_connections` limit is enforced by ____.",
      "the connection pool",
    );
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0 });
  });

  it("should mark a bit failed when a second, shorter or unicode-lookalike blank hides beside a valid one", async () => {
    const shortSecondBlankBit = { id: "kb_short_second_blank", body: "Some content" };
    const fullwidthSecondBlankBit = { id: "kb_fullwidth_second_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([
      shortSecondBlankBit,
      fullwidthSecondBlankBit,
    ]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockResolvedValueOnce({ prompt: "This ___ affects that ____.", answer: "anchor" })
      .mockResolvedValueOnce({ prompt: "A ＿＿＿＿ B ____.", answer: "anchor" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_short_second_blank");
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_fullwidth_second_blank");
    expect(result).toEqual({ scanned: 2, generated: 0, failed: 2 });
  });

  it("should mark a bit failed when the prompt is nothing but the blank marker, with no surrounding text", async () => {
    const bit = { id: "kb_bare_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({ prompt: "____", answer: "anchor" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_bare_blank");
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1 });
  });

  it("should mark a bit failed when the transactional insert+mark write itself throws", async () => {
    const bit = { id: "kb_txn_fail", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      prompt: "This ____ matters.",
      answer: "fact",
    });
    vi.mocked(recordGeneratedFillBlankVariant).mockRejectedValueOnce(new Error("db write failed"));

    const result = await generateKnowledgeBitFillBlanks();

    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_txn_fail");
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1 });
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
      .mockResolvedValueOnce({ prompt: "This ____ matters.", answer: "fact" });
    vi.mocked(markFillBlankGenerationFailed).mockRejectedValueOnce(new Error("db write failed"));

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_next",
      "fill_in_the_blank",
      0,
      "This ____ matters.",
      "fact",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1 });
  });
});
