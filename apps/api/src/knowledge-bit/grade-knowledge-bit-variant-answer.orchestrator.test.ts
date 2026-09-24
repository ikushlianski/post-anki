import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-variant-attempt.repo.js", () => ({
  getQuestionVariantById: vi.fn(),
  insertVariantAttempt: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-answer-grader.agent.js", () => ({
  runKnowledgeBitAnswerGrader: vi.fn(),
}));

const { getQuestionVariantById, insertVariantAttempt } = await import(
  "./knowledge-bit-variant-attempt.repo.js"
);
const { runKnowledgeBitAnswerGrader } = await import(
  "../mastra/knowledge-bit-answer-grader.agent.js"
);
const { gradeKnowledgeBitVariantAnswer } = await import(
  "./grade-knowledge-bit-variant-answer.orchestrator.js"
);

describe("gradeKnowledgeBitVariantAnswer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("grades a correct answer, stores the attempt, and returns the grade", async () => {
    const variant = {
      id: "kbqv_1",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_1", "Because of Y, precisely.");

    expect(runKnowledgeBitAnswerGrader).toHaveBeenCalledWith(
      variant.kind,
      variant.prompt,
      variant.answer,
      "Because of Y, precisely.",
    );
    expect(insertVariantAttempt).toHaveBeenCalledWith({
      variantId: "kbqv_1",
      userAnswer: "Because of Y, precisely.",
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });
    expect(result).toEqual({
      ok: true,
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });
  });

  it("grades an incomplete answer and still records the lower-scoring attempt", async () => {
    const variant = {
      id: "kbqv_2",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 3,
      verdict: "NeedsDeepDive",
      feedback: "Missing the actual mechanism.",
    });

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_2", "I don't really know.");

    expect(insertVariantAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ score: 3, verdict: "NeedsDeepDive" }),
    );
    expect(result).toEqual({
      ok: true,
      score: 3,
      verdict: "NeedsDeepDive",
      feedback: "Missing the actual mechanism.",
    });
  });

  it("passes the fill_in_the_blank kind through to the grader, not defaulting to wh_question", async () => {
    const variant = {
      id: "kbqv_fb",
      kind: "fill_in_the_blank" as const,
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 10,
      verdict: "Ok",
      feedback: "Exact term.",
    });

    await gradeKnowledgeBitVariantAnswer("kbqv_fb", "anchor");

    expect(runKnowledgeBitAnswerGrader).toHaveBeenCalledWith(
      "fill_in_the_blank",
      variant.prompt,
      variant.answer,
      "anchor",
    );
  });

  it("returns variant_not_found and never grades or inserts when the variant doesn't exist", async () => {
    vi.mocked(getQuestionVariantById).mockResolvedValue(null);

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_missing", "Some answer.");

    expect(result).toEqual({ ok: false, error: "variant_not_found" });
    expect(runKnowledgeBitAnswerGrader).not.toHaveBeenCalled();
    expect(insertVariantAttempt).not.toHaveBeenCalled();
  });

  it("grades against the variant's own prompt/answer, not any other text", async () => {
    const variant = {
      id: "kbqv_3",
      kind: "wh_question" as const,
      prompt: "Specific question?",
      answer: "Specific answer.",
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 5,
      verdict: "NeedsReview",
      feedback: "Partially right.",
    });

    await gradeKnowledgeBitVariantAnswer("kbqv_3", "My answer");

    const [, question, referenceAnswer] = vi.mocked(runKnowledgeBitAnswerGrader).mock.calls[0]!;
    expect(question).toBe("Specific question?");
    expect(referenceAnswer).toBe("Specific answer.");
  });
});
