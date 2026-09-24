import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit-question-variant.repo.js", () => ({
  listKnowledgeBitsForQuestionGenerationScan: vi.fn(),
  recordGeneratedQuestionVariant: vi.fn(),
  markWhQuestionGenerationFailed: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-question-generator.agent.js", () => ({
  runKnowledgeBitQuestionGenerator: vi.fn(),
}));

const {
  listKnowledgeBitsForQuestionGenerationScan,
  recordGeneratedQuestionVariant,
  markWhQuestionGenerationFailed,
} = await import("./knowledge-bit-question-variant.repo.js");
const { runKnowledgeBitQuestionGenerator } = await import(
  "../mastra/knowledge-bit-question-generator.agent.js"
);
const { generateKnowledgeBitQuestions, QUESTION_GENERATION_CAP } = await import(
  "./knowledge-bit-question-generation.orchestrator.js"
);

describe("generateKnowledgeBitQuestions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should record a wh_question variant (insert + mark, in one call) on success", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

    vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitQuestionGenerator).mockResolvedValue({
      question: "Why does an initial price anchor shift what feels fair later?",
      answer: "Because the first number seen sets the reference point comparisons are made against.",
    });

    const result = await generateKnowledgeBitQuestions();

    expect(recordGeneratedQuestionVariant).toHaveBeenCalledWith(
      "kb_1",
      "wh_question",
      0,
      "Why does an initial price anchor shift what feels fair later?",
      "Because the first number seen sets the reference point comparisons are made against.",
    );
    expect(markWhQuestionGenerationFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0 });
  });

  it("should mark a bit failed when the agent throws, and continue processing the next bit", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitQuestionGenerator)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ question: "Why does this matter?", answer: "Because of X." });

    const result = await generateKnowledgeBitQuestions();

    expect(markWhQuestionGenerationFailed).toHaveBeenCalledWith("kb_fail");
    expect(recordGeneratedQuestionVariant).toHaveBeenCalledWith(
      "kb_next",
      "wh_question",
      0,
      "Why does this matter?",
      "Because of X.",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1 });
  });

  it("should mark a bit failed when the agent returns a blank question or answer", async () => {
    const bit = { id: "kb_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitQuestionGenerator).mockResolvedValue({ question: "   ", answer: "An answer" });

    const result = await generateKnowledgeBitQuestions();

    expect(recordGeneratedQuestionVariant).not.toHaveBeenCalled();
    expect(markWhQuestionGenerationFailed).toHaveBeenCalledWith("kb_blank");
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1 });
  });

  it("should mark a bit failed when the transactional insert+mark write itself throws", async () => {
    const bit = { id: "kb_txn_fail", body: "Some content" };

    vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitQuestionGenerator).mockResolvedValue({
      question: "Why?",
      answer: "Because.",
    });
    vi.mocked(recordGeneratedQuestionVariant).mockRejectedValueOnce(new Error("db write failed"));

    const result = await generateKnowledgeBitQuestions();

    expect(markWhQuestionGenerationFailed).toHaveBeenCalledWith("kb_txn_fail");
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1 });
  });

  it("should cap the scan's batch size, leaving remainder bits unprocessed this call", async () => {
    const bits = Array.from({ length: QUESTION_GENERATION_CAP + 10 }, (_, i) => ({
      id: `kb_${i}`,
      body: `Body ${i}`,
    }));

    vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mockImplementation(async (limit: number) =>
      bits.slice(0, limit),
    );
    vi.mocked(runKnowledgeBitQuestionGenerator).mockResolvedValue({
      question: "Why?",
      answer: "Because.",
    });

    const result = await generateKnowledgeBitQuestions();

    const requestedLimit = vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mock.calls[0]![0];

    expect(requestedLimit).toBe(QUESTION_GENERATION_CAP);
    expect(result.scanned).toBe(QUESTION_GENERATION_CAP);
    expect(runKnowledgeBitQuestionGenerator).toHaveBeenCalledTimes(QUESTION_GENERATION_CAP);
  });

  it("should never let a markWhQuestionGenerationFailed write failure abort the rest of the batch", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForQuestionGenerationScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitQuestionGenerator)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ question: "Why?", answer: "Because." });
    vi.mocked(markWhQuestionGenerationFailed).mockRejectedValueOnce(new Error("db write failed"));

    const result = await generateKnowledgeBitQuestions();

    expect(recordGeneratedQuestionVariant).toHaveBeenCalledWith(
      "kb_next",
      "wh_question",
      0,
      "Why?",
      "Because.",
    );
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1 });
  });
});
