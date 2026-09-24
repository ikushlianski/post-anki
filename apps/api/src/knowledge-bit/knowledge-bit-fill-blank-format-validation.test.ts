import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
const { generateKnowledgeBitFillBlanks } = await import(
  "./knowledge-bit-fill-blank-generation.orchestrator.js"
);

const FAKE_CLAIM_TOKEN = "fbgc_fake_claim_token";

describe("generateKnowledgeBitFillBlanks blank-shape validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(claimKnowledgeBitForFillBlankGeneration).mockResolvedValue(FAKE_CLAIM_TOKEN);
  });

  it("should mark a bit failed when the agent returns a blank prompt or answer", async () => {
    const bit = { id: "kb_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "Some sentence.",
      prompt: "   ",
      answer: "an answer",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_blank", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the prompt has no ____ blank marker", async () => {
    const bit = { id: "kb_no_marker", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "This sentence has no blank marker.",
      prompt: "This sentence has no blank marker.",
      answer: "anchor",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_no_marker", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the prompt has more than one blank or an over-length run of underscores", async () => {
    const twoBlanksBit = { id: "kb_two_blanks", body: "Some content" };
    const longRunBit = { id: "kb_long_run", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([twoBlanksBit, longRunBit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockResolvedValueOnce({
        sentence: "This anchor affects that anchor.",
        prompt: "This ____ affects that ____.",
        answer: "anchor",
      })
      .mockResolvedValueOnce({ sentence: "This anchor matters.", prompt: "This _____ matters.", answer: "anchor" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_two_blanks", FAKE_CLAIM_TOKEN);
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_long_run", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 2, generated: 0, failed: 2, skipped: 0 });
  });

  it("should accept a correctly-formed single blank even when the sentence also contains an unrelated single underscore", async () => {
    const bit = { id: "kb_stray_underscore", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "The `max_connections` limit is enforced by the connection pool.",
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
      FAKE_CLAIM_TOKEN,
    );
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0, skipped: 0 });
  });

  it("should accept a correctly-formed single blank even when the sentence also contains a double-underscore identifier", async () => {
    const bit = { id: "kb_dunder_identifier", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "Node's __dirname points to the directory of the running script.",
      prompt: "Node's __dirname points to ____.",
      answer: "the directory of the running script",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).toHaveBeenCalledWith(
      "kb_dunder_identifier",
      "fill_in_the_blank",
      0,
      "Node's __dirname points to ____.",
      "the directory of the running script",
      FAKE_CLAIM_TOKEN,
    );
    expect(markFillBlankGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0, skipped: 0 });
  });

  it("should mark a bit failed when a second, shorter or unicode-lookalike blank hides beside a valid one", async () => {
    const shortSecondBlankBit = { id: "kb_short_second_blank", body: "Some content" };
    const fullwidthSecondBlankBit = { id: "kb_fullwidth_second_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([
      shortSecondBlankBit,
      fullwidthSecondBlankBit,
    ]);
    vi.mocked(runKnowledgeBitFillBlankGenerator)
      .mockResolvedValueOnce({
        sentence: "This anchor affects that anchor.",
        prompt: "This ___ affects that ____.",
        answer: "anchor",
      })
      .mockResolvedValueOnce({ sentence: "A anchor B anchor.", prompt: "A ＿＿＿＿ B ____.", answer: "anchor" });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_short_second_blank", FAKE_CLAIM_TOKEN);
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_fullwidth_second_blank", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 2, generated: 0, failed: 2, skipped: 0 });
  });

  it("should mark a bit failed when the prompt is nothing but the blank marker, with no surrounding text", async () => {
    const bit = { id: "kb_bare_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "anchor",
      prompt: "____",
      answer: "anchor",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_bare_blank", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it.each([
    "‗",
    "﹍",
    "▁",
    "‾",
    String.fromCodePoint(0xfe4e),
    String.fromCodePoint(0xfe4f),
  ])(
    "should mark a bit failed when the only blank is the unicode lookalike U+%s instead of underscores",
    async (lookalike) => {
      const codepointHex = lookalike.codePointAt(0)!.toString(16);
      const bit = { id: `kb_lookalike_${codepointHex}`, body: "Some content" };

      vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
      vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
        sentence: "This term matters.",
        prompt: `This ${lookalike.repeat(4)} matters.`,
        answer: "term",
      });

      const result = await generateKnowledgeBitFillBlanks();

      expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
      expect(markFillBlankGenerationFailed).toHaveBeenCalledWith(`kb_lookalike_${codepointHex}`, FAKE_CLAIM_TOKEN);
      expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
    },
  );

  it("should mark a bit failed when a lower-one-eighth-block lookalike blank hides beside a real one", async () => {
    const bit = { id: "kb_block_lookalike", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "This anchor affects that anchor.",
      prompt: "This ▁▁▁▁ affects that ____.",
      answer: "anchor",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_block_lookalike", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the answer contains a literal $ that String.replace would treat as a pattern", async () => {
    const bit = { id: "kb_dollar_answer", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "Use $ here.",
      prompt: "Use ____ here.",
      answer: "$$",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_dollar_answer", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the answer substituted into the blank doesn't reproduce the sentence", async () => {
    const bit = { id: "kb_answer_mismatch", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "An initial price anchor shifts what feels fair later.",
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "discount",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_answer_mismatch", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the blank has no alphabetic text around it", async () => {
    const bit = { id: "kb_punctuation_only", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "42.",
      prompt: "____.",
      answer: "42",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_punctuation_only", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should mark a bit failed when the blank marker touches a letter with no separating space", async () => {
    const bit = { id: "kb_letter_touching", body: "Some content" };

    vi.mocked(listKnowledgeBitsForFillBlankGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitFillBlankGenerator).mockResolvedValue({
      sentence: "The wording is understood.",
      prompt: "The word____ is understood.",
      answer: "ing",
    });

    const result = await generateKnowledgeBitFillBlanks();

    expect(recordGeneratedFillBlankVariant).not.toHaveBeenCalled();
    expect(markFillBlankGenerationFailed).toHaveBeenCalledWith("kb_letter_touching", FAKE_CLAIM_TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });
});
