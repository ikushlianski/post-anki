import { describe, expect, it } from "vitest";
import { generatedQuestionSchema } from "./probe-question.js";

describe("generatedQuestionSchema — LRU archetype rotation (issue #36)", () => {
  it("accepts a question with no applicableArchetypes field, unchanged from before (AC 16)", () => {
    const result = generatedQuestionSchema.safeParse({
      prompt: "Explain the tradeoff.",
      options: [],
      correctAnswerIndex: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts an optional applicableArchetypes array of valid archetype values (AC 16)", () => {
    const result = generatedQuestionSchema.safeParse({
      prompt: "Explain the tradeoff.",
      options: [],
      correctAnswerIndex: null,
      applicableArchetypes: ["scenario_based", "design_challenge"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an applicableArchetypes value outside the 5-archetype enum", () => {
    const result = generatedQuestionSchema.safeParse({
      prompt: "Explain the tradeoff.",
      options: [],
      correctAnswerIndex: null,
      applicableArchetypes: ["not_a_real_archetype"],
    });

    expect(result.success).toBe(false);
  });
});
