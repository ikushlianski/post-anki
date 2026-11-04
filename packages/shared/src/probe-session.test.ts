import { describe, expect, it } from "vitest";
import {
  answerProbeSessionInput,
  answerProbeSessionResultSchema,
  prepareProbeSessionInput,
  probeSessionQuestionSchema,
} from "./probe-session";

const question = {
  id: "q1",
  order: 0,
  topicId: null,
  gapId: null,
  prompt: "p",
  options: ["a", "b"],
  difficulty: "easy",
  format: "mcq",
  type: "multi",
  answeredIndex: null,
  answeredIndexes: null,
  outcome: null,
  correctAnswerIndex: null,
  correctAnswerIndexes: null,
  optionExplanations: null,
};

const result = {
  questionId: "q1",
  outcome: "pass",
  correctAnswerIndex: 0,
  correctAnswerIndexes: null,
  correct: 1,
  answered: 1,
  total: 3,
  status: "active",
  coveredGapLabels: [],
  optionExplanations: [{ text: "why", citationUrl: null }],
  gapMastery: null,
  courseLengthRecommendation: null,
};

describe("answerProbeSessionInput", () => {
  it("should accept a single index or a list of indices", () => {
    expect(answerProbeSessionInput.safeParse({ sessionId: "s", questionId: "q", selectedIndex: 1 }).success).toBe(true);
    expect(answerProbeSessionInput.safeParse({ sessionId: "s", questionId: "q", selectedIndices: [0, 2] }).success).toBe(true);
  });

  it("should reject an answer with no question id", () => {
    expect(answerProbeSessionInput.safeParse({ sessionId: "s", selectedIndex: 1 }).success).toBe(false);
  });
});

describe("answerProbeSessionResultSchema", () => {
  it("should accept a full result and expose the option explanations", () => {
    expect(answerProbeSessionResultSchema.parse(result).optionExplanations?.[0]?.text).toBe("why");
  });

  it("should reject a result with an unknown outcome", () => {
    expect(answerProbeSessionResultSchema.safeParse({ ...result, outcome: "maybe" }).success).toBe(false);
  });
});

describe("probeSessionQuestionSchema", () => {
  it("should accept single and multi questions and reject an unknown type", () => {
    expect(probeSessionQuestionSchema.safeParse(question).success).toBe(true);
    expect(probeSessionQuestionSchema.safeParse({ ...question, type: "single" }).success).toBe(true);
    expect(probeSessionQuestionSchema.safeParse({ ...question, type: "essay" }).success).toBe(false);
  });
});

describe("prepareProbeSessionInput", () => {
  it("should accept a scope and id, and reject an unknown scope", () => {
    expect(prepareProbeSessionInput.safeParse({ scope: "topic", scopeId: "t1" }).success).toBe(true);
    expect(prepareProbeSessionInput.safeParse({ scope: "galaxy", scopeId: "t1" }).success).toBe(false);
  });
});
