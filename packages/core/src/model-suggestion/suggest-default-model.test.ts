import { describe, expect, it } from "vitest";
import {
  MIN_GRADED_RUNS_PER_MODEL,
  MIN_MODELS_FOR_SUGGESTION,
  scoreModel,
  suggestDefaultModel,
  type ModelEvidence,
} from "./suggest-default-model";

function model(modelId: string, overrides: Partial<ModelEvidence> = {}): ModelEvidence {
  return {
    modelId,
    gradedRuns: 3,
    extractionAverage: 4,
    cardAverage: 4,
    wordingAverage: 4,
    approved: 8,
    rejected: 2,
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    ...overrides,
  };
}

function ready(count: number, overrides: (index: number) => Partial<ModelEvidence> = () => ({})): ModelEvidence[] {
  return Array.from({ length: count }, (_, index) => model(`m${index}`, overrides(index)));
}

describe("evidence thresholds", () => {
  it("should require five models with three graded runs each", () => {
    expect(MIN_MODELS_FOR_SUGGESTION).toBe(5);
    expect(MIN_GRADED_RUNS_PER_MODEL).toBe(3);
  });

  it("should not suggest anything below the threshold and say how many models are ready", () => {
    const result = suggestDefaultModel(ready(4));

    expect(result).toMatchObject({ status: "not_enough_evidence", modelsReady: 4, modelsNeeded: 5 });
  });

  it("should suggest once exactly five models have three graded runs", () => {
    const result = suggestDefaultModel(ready(5));

    expect(result.status).toBe("suggestion");
  });

  it("should not count a model with only two graded runs as ready and say how many runs it still needs", () => {
    const result = suggestDefaultModel([...ready(4), model("slow", { gradedRuns: 2 })]);

    expect(result).toMatchObject({ status: "not_enough_evidence", modelsReady: 4 });
    expect(result.status === "not_enough_evidence" && result.perModelProgress).toContainEqual({
      modelId: "slow",
      gradedRuns: 2,
      remainingRuns: 1,
    });
  });

  it("should never suggest a model that has fewer than three graded runs even when it scores best", () => {
    const result = suggestDefaultModel([
      ...ready(5),
      model("lucky", { gradedRuns: 2, extractionAverage: 5, cardAverage: 5, wordingAverage: 5, approved: 9, rejected: 0 }),
    ]);

    expect(result.status === "suggestion" && result.modelId).not.toBe("lucky");
  });

  it("should leave out models that have no graded runs from the progress list", () => {
    const result = suggestDefaultModel([model("none", { gradedRuns: 0 })]);

    expect(result.status === "not_enough_evidence" && result.perModelProgress).toEqual([]);
  });
});

describe("scoring", () => {
  it("should weight extraction 40%, card 25%, wording 20% and approval rate 15%", () => {
    const score = scoreModel(
      model("a", { extractionAverage: 5, cardAverage: 3, wordingAverage: 1, approved: 1, rejected: 1 }),
    )!

    expect(score).toBeCloseTo(0.4 * 5 + 0.25 * 3 + 0.2 * 1 + 0.15 * 3, 5)
  });

  it("should scale an all-approved record to 5 and an all-rejected one to 1", () => {
    expect(scoreModel(model("a", { extractionAverage: null, cardAverage: null, wordingAverage: null, approved: 4, rejected: 0 }))).toBe(5);
    expect(scoreModel(model("a", { extractionAverage: null, cardAverage: null, wordingAverage: null, approved: 0, rejected: 4 }))).toBe(1);
  });

  it("should ignore missing components and renormalise the weights over the rest", () => {
    const score = scoreModel(
      model("a", { extractionAverage: 5, cardAverage: null, wordingAverage: null, approved: 0, rejected: 0 }),
    )

    expect(score).toBe(5)
  });

  it("should give no score when nothing is known about a model", () => {
    expect(
      scoreModel(model("a", { extractionAverage: null, cardAverage: null, wordingAverage: null, approved: 0, rejected: 0 })),
    ).toBeNull()
  });

  it("should pick the model with the best weighted score", () => {
    const result = suggestDefaultModel(
      ready(5, (index) => (index === 3 ? { extractionAverage: 5, cardAverage: 5, wordingAverage: 5, approved: 10, rejected: 0 } : {})),
    )

    expect(result).toMatchObject({ status: "suggestion", modelId: "m3" })
  });
});

describe("ties", () => {
  it("should give a tie within 0.1 to the cheaper model", () => {
    const result = suggestDefaultModel([
      model("pricey", { extractionAverage: 4.3, inputPerMillion: 2, outputPerMillion: 10 }),
      model("cheap", { extractionAverage: 4.25, inputPerMillion: 0.05, outputPerMillion: 0.2 }),
      ...ready(3, (index) => ({ extractionAverage: 3, modelId: `x${index}` })),
    ])

    expect(result).toMatchObject({ status: "suggestion", modelId: "cheap" })
  });

  it("should not trade a clearly better score for a lower price", () => {
    const result = suggestDefaultModel([
      model("best", { extractionAverage: 5, cardAverage: 5, wordingAverage: 5, approved: 10, rejected: 0, inputPerMillion: 5, outputPerMillion: 20 }),
      model("cheap", { extractionAverage: 3, inputPerMillion: 0.05, outputPerMillion: 0.2 }),
      ...ready(3, (index) => ({ extractionAverage: 3, modelId: `x${index}` })),
    ])

    expect(result).toMatchObject({ status: "suggestion", modelId: "best" })
  });
});

describe("basis", () => {
  it("should report the graded runs and the models behind the suggestion", () => {
    const result = suggestDefaultModel(ready(5, (index) => ({ gradedRuns: 3 + index })))

    expect(result).toMatchObject({ status: "suggestion", basis: { gradedRuns: 25, models: 5 } })
  });
});
