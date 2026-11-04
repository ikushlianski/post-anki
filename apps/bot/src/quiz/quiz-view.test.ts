import { describe, it, expect } from "vitest";
import type {
  AnswerProbeSessionResult,
  ProbeSession,
  ProbeSessionQuestion,
} from "@post-anki/shared";
import {
  formatQuestion,
  formatAnswerReveal,
  formatQuizComplete,
  firstUnanswered,
  findQuestion,
} from "./quiz-view.js";

function question(over: Partial<ProbeSessionQuestion> = {}): ProbeSessionQuestion {
  return {
    id: "q1",
    order: 0,
    topicId: "t1",
    gapId: "g1",
    prompt: "Is the sky blue?",
    options: ["Yes", "No"],
    difficulty: "easy",
    format: "true_false",
    type: "single",
    answeredIndex: null,
    answeredIndexes: null,
    outcome: null,
    correctAnswerIndex: null,
    correctAnswerIndexes: null,
    optionExplanations: null,
    ...over,
  };
}

function session(questions: ProbeSessionQuestion[]): ProbeSession {
  return {
    id: "s1",
    scope: "topic",
    scopeId: "t1",
    curriculumId: "c1",
    mode: "practice",
    status: "active",
    total: questions.length,
    correct: 0,
    answered: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    questions,
  };
}

describe("formatQuestion", () => {
  it("numbers options and shows progress", () => {
    const text = formatQuestion(question(), {
      answered: 1,
      total: 3,
      correct: 1,
    });
    expect(text).toContain("Question 2/3");
    expect(text).toContain("1. Yes");
    expect(text).toContain("2. No");
    expect(text).toContain("Score so far: 1/1");
  });
});

describe("formatQuestion multi", () => {
  it("should tell the learner to finish a multi-answer question on the web", () => {
    const text = formatQuestion(question({ type: "multi" }), { answered: 0, total: 1, correct: 0 });

    expect(text).toContain("Several answers apply");
  });
});

describe("formatAnswerReveal explanation", () => {
  const base: AnswerProbeSessionResult = {
    questionId: "q1",
    outcome: "pass",
    correctAnswerIndex: 1,
    correctAnswerIndexes: null,
    correct: 1,
    answered: 1,
    total: 2,
    status: "active",
    coveredGapLabels: [],
    optionExplanations: null,
    gapMastery: null,
    courseLengthRecommendation: null,
  };

  it("should add the correct option's explanation clipped to 400 characters, with its citation", () => {
    const text = formatAnswerReveal(
      {
        ...base,
        optionExplanations: [
          { text: "wrong one", citationUrl: null },
          { text: "x".repeat(600), citationUrl: "https://docs.example.com/a" },
        ],
      },
      question(),
    );

    expect(text).toContain(`${"x".repeat(399)}…`);
    expect(text).not.toContain("x".repeat(401));
    expect(text).not.toContain("wrong one");
    expect(text).toContain("https://docs.example.com/a");
  });

  it("should not cut an emoji in half when clipping the explanation", () => {
    const text = formatAnswerReveal(
      {
        ...base,
        optionExplanations: [
          { text: "", citationUrl: null },
          { text: `${"x".repeat(398)}😀 and more`, citationUrl: null },
        ],
      },
      question(),
    );

    expect(() => encodeURIComponent(text)).not.toThrow();
  });

  it("should show no explanation block when none is provided", () => {
    const text = formatAnswerReveal(base, question());

    expect(text).toBe("✅ Correct\n\nAnswer: No\n\nProgress: 1/2 · 1 correct");
  });
});

describe("formatAnswerReveal", () => {
  it("reveals the correct option text on a pass", () => {
    const result: AnswerProbeSessionResult = {
      questionId: "q1",
      outcome: "pass",
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 1,
      answered: 1,
      total: 2,
      status: "active",
      coveredGapLabels: ["keys"],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    };
    const text = formatAnswerReveal(result, question());
    expect(text).toContain("✅ Correct");
    expect(text).toContain("Answer: Yes");
    expect(text).toContain("Covered: keys");
    expect(text).toContain("1/2 · 1 correct");
  });

  it("marks a fail and still reveals the answer", () => {
    const result: AnswerProbeSessionResult = {
      questionId: "q1",
      outcome: "fail",
      correctAnswerIndex: 1,
      correctAnswerIndexes: null,
      correct: 0,
      answered: 1,
      total: 2,
      status: "active",
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    };
    const text = formatAnswerReveal(result, question());
    expect(text).toContain("❌ Not quite");
    expect(text).toContain("Answer: No");
  });
});

describe("formatQuizComplete", () => {
  it("computes a final percentage", () => {
    const result: AnswerProbeSessionResult = {
      questionId: "q2",
      outcome: "pass",
      correctAnswerIndex: 0,
      correctAnswerIndexes: null,
      correct: 3,
      answered: 4,
      total: 4,
      status: "completed",
      coveredGapLabels: [],
      optionExplanations: null,
      gapMastery: null,
      courseLengthRecommendation: null,
    };
    const text = formatQuizComplete(result, "Backend › Module › Topic");
    expect(text).toContain("3/4 (75%)");
    expect(text).toContain("Backend › Module › Topic");
  });
});

describe("firstUnanswered", () => {
  it("returns the lowest-order unanswered question", () => {
    const s = session([
      question({ id: "q1", order: 0, answeredIndex: 1 }),
      question({ id: "q2", order: 1, answeredIndex: null }),
      question({ id: "q3", order: 2, answeredIndex: null }),
    ]);
    expect(firstUnanswered(s)?.id).toBe("q2");
  });

  it("returns null when all answered", () => {
    const s = session([question({ answeredIndex: 0 })]);
    expect(firstUnanswered(s)).toBeNull();
  });
});

describe("findQuestion", () => {
  it("finds a question by id", () => {
    const s = session([question({ id: "q1" }), question({ id: "q2" })]);
    expect(findQuestion(s, "q2")?.id).toBe("q2");
  });
});
