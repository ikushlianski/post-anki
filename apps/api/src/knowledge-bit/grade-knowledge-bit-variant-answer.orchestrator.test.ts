import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-variant-attempt.repo.js", () => ({
  getQuestionVariantById: vi.fn(),
  insertVariantAttempt: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-answer-grader.agent.js", () => ({
  runKnowledgeBitAnswerGrader: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-followup-generator.agent.js", () => ({
  runKnowledgeBitFollowupGenerator: vi.fn(),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../tag/tag.repo.js", () => ({
  listAssignmentsForNodes: vi.fn(),
}));

vi.mock("./knowledge-bit-schedule.repo.js", () => ({
  reviewKnowledgeBitSchedule: vi.fn(),
}));

const { getQuestionVariantById, insertVariantAttempt } = await import(
  "./knowledge-bit-variant-attempt.repo.js"
);
const { runKnowledgeBitAnswerGrader } = await import(
  "../mastra/knowledge-bit-answer-grader.agent.js"
);
const { runKnowledgeBitFollowupGenerator } = await import(
  "../mastra/knowledge-bit-followup-generator.agent.js"
);
const { listAssignmentsForNodes } = await import("../tag/tag.repo.js");
const { reviewKnowledgeBitSchedule } = await import("./knowledge-bit-schedule.repo.js");
const { gradeKnowledgeBitVariantAnswer } = await import(
  "./grade-knowledge-bit-variant-answer.orchestrator.js"
);

function fakeAssignment(tagId: string) {
  return { id: `tga_${tagId}`, tagId, nodeType: "knowledgeBit" as const, nodeId: "kb_1", createdAt: new Date().toISOString() };
}

describe("gradeKnowledgeBitVariantAnswer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(insertVariantAttempt).mockResolvedValue({ ok: true });
  });

  it("grades a correct answer, stores the attempt, and returns the grade", async () => {
    const variant = {
      id: "kbqv_1",
      knowledgeBitId: "kb_1",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(insertVariantAttempt).mockResolvedValue({ ok: true });
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });
    vi.mocked(runKnowledgeBitFollowupGenerator).mockResolvedValue({
      followUpQuestion: "What would change if Y were reversed?",
    });
    vi.mocked(listAssignmentsForNodes).mockResolvedValue([
      fakeAssignment("tag_x"),
      fakeAssignment("tag_y"),
    ]);

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
    expect(runKnowledgeBitFollowupGenerator).toHaveBeenCalledWith(
      variant.kind,
      variant.prompt,
      variant.answer,
      "Because of Y, precisely.",
      "Ok",
      "Captures the reasoning.",
    );
    expect(listAssignmentsForNodes).toHaveBeenCalledWith(["kb_1"]);
    expect(reviewKnowledgeBitSchedule).toHaveBeenCalledWith("kb_1", "Ok");
    expect(result).toEqual({
      ok: true,
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
      followUpQuestion: "What would change if Y were reversed?",
      tagIds: ["tag_x", "tag_y"],
    });
  });

  it("grades an incomplete answer and still records the lower-scoring attempt", async () => {
    const variant = {
      id: "kbqv_2",
      knowledgeBitId: "kb_2",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 3,
      verdict: "NeedsDeepDive",
      feedback: "Missing the actual mechanism.",
    });
    vi.mocked(runKnowledgeBitFollowupGenerator).mockResolvedValue({
      followUpQuestion: "What actual mechanism connects X and Y?",
    });
    vi.mocked(listAssignmentsForNodes).mockResolvedValue([]);

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_2", "I don't really know.");

    expect(insertVariantAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ score: 3, verdict: "NeedsDeepDive" }),
    );
    expect(runKnowledgeBitFollowupGenerator).toHaveBeenCalledWith(
      variant.kind,
      variant.prompt,
      variant.answer,
      "I don't really know.",
      "NeedsDeepDive",
      "Missing the actual mechanism.",
    );
    expect(result).toEqual({
      ok: true,
      score: 3,
      verdict: "NeedsDeepDive",
      feedback: "Missing the actual mechanism.",
      followUpQuestion: "What actual mechanism connects X and Y?",
      tagIds: [],
    });
  });

  it("passes the fill_in_the_blank kind through to the grader, not defaulting to wh_question", async () => {
    const variant = {
      id: "kbqv_fb",
      knowledgeBitId: "kb_fb",
      kind: "fill_in_the_blank" as const,
      prompt: "An initial price ____ shifts what feels fair later.",
      answer: "anchor",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 10,
      verdict: "Ok",
      feedback: "Exact term.",
    });
    vi.mocked(runKnowledgeBitFollowupGenerator).mockResolvedValue({
      followUpQuestion: "What other decision could an anchor distort?",
    });
    vi.mocked(listAssignmentsForNodes).mockResolvedValue([fakeAssignment("tag_pricing")]);

    await gradeKnowledgeBitVariantAnswer("kbqv_fb", "anchor");

    expect(runKnowledgeBitAnswerGrader).toHaveBeenCalledWith(
      "fill_in_the_blank",
      variant.prompt,
      variant.answer,
      "anchor",
    );
    expect(runKnowledgeBitFollowupGenerator).toHaveBeenCalledWith(
      "fill_in_the_blank",
      variant.prompt,
      variant.answer,
      "anchor",
      "Ok",
      "Exact term.",
    );
  });

  it("still returns the already-graded, already-stored grade when follow-up generation fails", async () => {
    const variant = {
      id: "kbqv_4",
      knowledgeBitId: "kb_4",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });
    vi.mocked(runKnowledgeBitFollowupGenerator).mockRejectedValue(new Error("provider down"));
    vi.mocked(listAssignmentsForNodes).mockResolvedValue([]);

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_4", "Because of Y.");

    expect(insertVariantAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ score: 9, verdict: "Ok" }),
    );
    expect(result).toEqual({
      ok: true,
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
      followUpQuestion: null,
      tagIds: [],
    });
  });

  it("still returns the already-graded grade with an empty tagIds when tag lookup fails", async () => {
    const variant = {
      id: "kbqv_5",
      knowledgeBitId: "kb_5",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });
    vi.mocked(runKnowledgeBitFollowupGenerator).mockResolvedValue({
      followUpQuestion: "What if Y were reversed?",
    });
    vi.mocked(listAssignmentsForNodes).mockRejectedValue(new Error("db down"));

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_5", "Because of Y.");

    expect(insertVariantAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ score: 9, verdict: "Ok" }),
    );
    expect(result).toEqual({
      ok: true,
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
      followUpQuestion: "What if Y were reversed?",
      tagIds: [],
    });
  });

  it("returns variant_not_found and never grade or insert when the variant doesn't exist", async () => {
    vi.mocked(getQuestionVariantById).mockResolvedValue(null);

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_missing", "Some answer.");

    expect(result).toEqual({ ok: false, error: "variant_not_found" });
    expect(runKnowledgeBitAnswerGrader).not.toHaveBeenCalled();
    expect(insertVariantAttempt).not.toHaveBeenCalled();
    expect(runKnowledgeBitFollowupGenerator).not.toHaveBeenCalled();
    expect(listAssignmentsForNodes).not.toHaveBeenCalled();
  });

  it("should return not_approved and never grade or insert when the variant's bit is still pending", async () => {
    const variant = {
      id: "kbqv_pending",
      knowledgeBitId: "kb_pending",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
      approvalState: "pending" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_pending", "Some answer.");

    expect(result).toEqual({ ok: false, error: "not_approved" });
    expect(runKnowledgeBitAnswerGrader).not.toHaveBeenCalled();
    expect(insertVariantAttempt).not.toHaveBeenCalled();
  });

  it("should refuse a basic card before any grader call, since typed grading has no rule for it", async () => {
    vi.mocked(getQuestionVariantById).mockResolvedValue({
      id: "kbqv_basic",
      knowledgeBitId: "kb_basic",
      kind: "basic" as const,
      prompt: "What is TTL?",
      answer: "Time to live",
      approvalState: "approved" as const,
    });

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_basic", "Time to live");

    expect(result).toEqual({ ok: false, error: "kind_not_typed" });
    expect(runKnowledgeBitAnswerGrader).not.toHaveBeenCalled();
    expect(insertVariantAttempt).not.toHaveBeenCalled();
  });

  it("should return not_approved when the attempt-recording repo rejects an unapproved bit directly", async () => {
    const variant = {
      id: "kbqv_6",
      knowledgeBitId: "kb_6",
      kind: "wh_question" as const,
      prompt: "Why does X happen?",
      answer: "Because of Y.",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 9,
      verdict: "Ok",
      feedback: "Captures the reasoning.",
    });
    vi.mocked(insertVariantAttempt).mockResolvedValue({ error: "not_approved" });

    const result = await gradeKnowledgeBitVariantAnswer("kbqv_6", "Because of Y.");

    expect(result).toEqual({ ok: false, error: "not_approved" });
    expect(runKnowledgeBitFollowupGenerator).not.toHaveBeenCalled();
  });

  it("grades against the variant's own prompt/answer, not any other text", async () => {
    const variant = {
      id: "kbqv_3",
      knowledgeBitId: "kb_3",
      kind: "wh_question" as const,
      prompt: "Specific question?",
      answer: "Specific answer.",
      approvalState: "approved" as const,
    };

    vi.mocked(getQuestionVariantById).mockResolvedValue(variant);
    vi.mocked(runKnowledgeBitAnswerGrader).mockResolvedValue({
      score: 5,
      verdict: "NeedsReview",
      feedback: "Partially right.",
    });
    vi.mocked(runKnowledgeBitFollowupGenerator).mockResolvedValue({
      followUpQuestion: "What is still unclear?",
    });
    vi.mocked(listAssignmentsForNodes).mockResolvedValue([]);

    await gradeKnowledgeBitVariantAnswer("kbqv_3", "My answer");

    const [, question, referenceAnswer] = vi.mocked(runKnowledgeBitAnswerGrader).mock.calls[0]!;
    expect(question).toBe("Specific question?");
    expect(referenceAnswer).toBe("Specific answer.");
  });
});
