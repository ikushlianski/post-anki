import { describe, expect, it } from "vitest";
import { buildModelEvidence } from "./knowledge-bit-model-suggestion.js";

const TODAY = new Date("2026-10-12T00:00:00Z");

describe("buildModelEvidence", () => {
  it("should join graded runs, card grades, approvals and the catalog price per model", () => {
    const evidence = buildModelEvidence(
      {
        extraction: [{ modelId: "openrouter/anthropic/claude-haiku-5.5", gradedRuns: 3, extractionAverage: 4.5 }],
        decisions: [
          {
            modelId: "openrouter/anthropic/claude-haiku-5.5",
            cardAverage: 4,
            wordingAverage: 3.5,
            approved: 6,
            rejected: 2,
          },
        ],
      },
      TODAY,
    );

    expect(evidence).toEqual([
      {
        modelId: "openrouter/anthropic/claude-haiku-5.5",
        gradedRuns: 3,
        extractionAverage: 4.5,
        cardAverage: 4,
        wordingAverage: 3.5,
        approved: 6,
        rejected: 2,
        inputPerMillion: 0.1,
        outputPerMillion: 0.5,
      },
    ]);
  });

  it("should count a model that has decisions but no graded run with zero graded runs", () => {
    const evidence = buildModelEvidence(
      {
        extraction: [],
        decisions: [
          { modelId: "openrouter/openai/gpt-6-luna", cardAverage: 5, wordingAverage: null, approved: 1, rejected: 0 },
        ],
      },
      TODAY,
    );

    expect(evidence[0]).toMatchObject({ gradedRuns: 0, extractionAverage: null, cardAverage: 5 });
  });

  it("should leave out models that are no longer on the list or have expired", () => {
    const evidence = buildModelEvidence(
      {
        extraction: [
          { modelId: "some/removed-model", gradedRuns: 9, extractionAverage: 5 },
          { modelId: "openrouter/google/gemini-2.5-flash-lite", gradedRuns: 9, extractionAverage: 5 },
        ],
        decisions: [],
      },
      new Date("2026-10-25T00:00:00Z"),
    );

    expect(evidence).toEqual([]);
  });
});

describe("buildModelEvidence with comparison grades", () => {
  const haiku = "openrouter/anthropic/claude-haiku-5.5";

  it("should count each graded comparison result as one more graded run for its model", () => {
    const evidence = buildModelEvidence(
      { extraction: [{ modelId: haiku, gradedRuns: 2, extractionAverage: 4 }], decisions: [] },
      TODAY,
      [{ modelId: haiku, gradedRuns: 3, extractionAverage: 5, cardAverage: 4, wordingAverage: 3 }],
    );

    expect(evidence[0]).toMatchObject({ gradedRuns: 5, extractionAverage: 4.6, cardAverage: 4, wordingAverage: 3 });
  });

  it("should weight app grades and comparison grades by their graded runs", () => {
    const evidence = buildModelEvidence(
      {
        extraction: [{ modelId: haiku, gradedRuns: 1, extractionAverage: 2 }],
        decisions: [{ modelId: haiku, cardAverage: 2, wordingAverage: 2, approved: 1, rejected: 1 }],
      },
      TODAY,
      [{ modelId: haiku, gradedRuns: 3, extractionAverage: 4, cardAverage: 4, wordingAverage: 4 }],
    );

    expect(evidence[0]).toMatchObject({ gradedRuns: 4, extractionAverage: 3.5, cardAverage: 3.5, wordingAverage: 3.5 });
  });

  it("should start evidence for a model that only has comparison grades", () => {
    const evidence = buildModelEvidence({ extraction: [], decisions: [] }, TODAY, [
      { modelId: "openrouter/openai/gpt-6-luna", gradedRuns: 3, extractionAverage: 4, cardAverage: null, wordingAverage: null },
    ]);

    expect(evidence[0]).toMatchObject({
      modelId: "openrouter/openai/gpt-6-luna",
      gradedRuns: 3,
      extractionAverage: 4,
      cardAverage: null,
      approved: 0,
    });
  });

  it("should ignore comparison grades for a retired model", () => {
    const evidence = buildModelEvidence({ extraction: [], decisions: [] }, new Date("2026-10-21T00:00:00Z"), [
      { modelId: "openrouter/google/gemini-2.5-flash-lite", gradedRuns: 5, extractionAverage: 5, cardAverage: null, wordingAverage: null },
    ]);

    expect(evidence).toEqual([]);
  });
});

