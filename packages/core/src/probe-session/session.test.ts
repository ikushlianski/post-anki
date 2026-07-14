import { describe, it, expect } from "vitest";
import type { ProbeSessionQuestion } from "@post-anki/shared";
import {
  deriveQuizOutcome,
  deriveSessionProgress,
  nextUnansweredQuestion,
} from "./session";

function question(
  overrides: Partial<ProbeSessionQuestion> & { id: string; order: number },
): ProbeSessionQuestion {
  return {
    topicId: "t-1",
    gapId: null,
    prompt: "Q",
    options: ["a", "b"],
    difficulty: "medium",
    format: "mcq",
    answeredIndex: null,
    outcome: null,
    correctAnswerIndex: null,
    ...overrides,
  };
}

describe("deriveQuizOutcome", () => {
  it("passes when the chosen option matches the stored answer", () => {
    expect(deriveQuizOutcome(2, 2)).toBe("pass");
  });

  it("fails when the chosen option differs from the stored answer", () => {
    expect(deriveQuizOutcome(0, 2)).toBe("fail");
  });
});

describe("deriveSessionProgress", () => {
  it("counts answered and correct across the batch", () => {
    const questions = [
      question({ id: "a", order: 1, answeredIndex: 1, outcome: "pass" }),
      question({ id: "b", order: 2, answeredIndex: 0, outcome: "fail" }),
      question({ id: "c", order: 3 }),
    ];

    expect(deriveSessionProgress(questions)).toEqual({
      total: 3,
      answered: 2,
      correct: 1,
      status: "active",
    });
  });

  it("completes once every question is answered", () => {
    const questions = [
      question({ id: "a", order: 1, answeredIndex: 1, outcome: "pass" }),
      question({ id: "b", order: 2, answeredIndex: 0, outcome: "fail" }),
    ];

    expect(deriveSessionProgress(questions).status).toBe("completed");
  });

  it("treats an empty batch as active with no progress", () => {
    expect(deriveSessionProgress([])).toEqual({
      total: 0,
      answered: 0,
      correct: 0,
      status: "active",
    });
  });
});

describe("nextUnansweredQuestion", () => {
  it("returns the lowest-order unanswered question for resume", () => {
    const questions = [
      question({ id: "a", order: 1, answeredIndex: 1, outcome: "pass" }),
      question({ id: "c", order: 3 }),
      question({ id: "b", order: 2 }),
    ];

    expect(nextUnansweredQuestion(questions)?.id).toBe("b");
  });

  it("returns null when the whole batch is answered", () => {
    const questions = [
      question({ id: "a", order: 1, answeredIndex: 1, outcome: "pass" }),
    ];

    expect(nextUnansweredQuestion(questions)).toBeNull();
  });
});
