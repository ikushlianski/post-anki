import { describe, it, expect } from "vitest";
import type { GeneratedProbeQuestion } from "@post-anki/shared";
import { buildQuestionRows } from "./probe-session.map.js";

function generated(
  overrides: Partial<GeneratedProbeQuestion>,
): GeneratedProbeQuestion {
  return {
    prompt: "Q",
    options: ["a", "b", "c"],
    correctAnswerIndex: 0,
    difficulty: "medium",
    format: "mcq",
    gapLabel: null,
    topicTitle: null,
    ...overrides,
  };
}

describe("buildQuestionRows", () => {
  it("resolves gap ids and topic ids from labels case-insensitively", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [
        generated({ topicTitle: "Caching Layers", gapLabel: "Cache Invalidation" }),
      ],
      defaultTopicId: "t-default",
      topicIdByTitle: new Map([["caching layers", "t-cache"]]),
      gapIdByKey: new Map([["t-cache::cache invalidation", "g-1"]]),
      makeId: (i) => `q${i}`,
    });

    expect(rows[0]!.topicId).toBe("t-cache");
    expect(rows[0]!.gapId).toBe("g-1");
  });

  it("falls back to the default topic and null gap when nothing matches", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [generated({ topicTitle: "Unknown", gapLabel: "Unmapped" })],
      defaultTopicId: "t-default",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
    });

    expect(rows[0]!.topicId).toBe("t-default");
    expect(rows[0]!.gapId).toBeNull();
  });

  it("assigns sequential order and maps format onto the kind column", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [
        generated({ format: "true_false", options: ["True", "False"] }),
        generated({ format: "mcq" }),
      ],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
    });

    expect(rows.map((r) => r.order)).toEqual([1, 2]);
    expect(rows[0]!.kind).toBe("true_false");
    expect(rows[1]!.kind).toBe("mcq");
  });

  it("clamps an out-of-range correct answer index into the options range", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [generated({ options: ["a", "b"], correctAnswerIndex: 9 })],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
    });

    expect(rows[0]!.correctAnswerIndex).toBe(1);
  });

  it("backfills true/false options when the model returns none", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [generated({ options: [], correctAnswerIndex: 0 })],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
    });

    expect(rows[0]!.options).toEqual(["True", "False"]);
  });

  it("defaults every question to type single with no correct-answer-indexes array", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [generated({})],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
    });

    expect(rows[0]!.type).toBe("single");
    expect(rows[0]!.correctAnswerIndexes).toBeNull();
    expect(rows[0]!.answeredIndex).toBeNull();
    expect(rows[0]!.answeredIndexes).toBeNull();
  });

  it("applies the injected permutation, keeping the correct answer index pointed at the right option", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [
        generated({ options: ["a", "b", "c"], correctAnswerIndex: 0 }),
      ],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
      makePermutation: () => [2, 0, 1],
    });

    expect(rows[0]!.options).toEqual(["c", "a", "b"]);
    expect(rows[0]!.options[rows[0]!.correctAnswerIndex]).toBe("a");
  });

  it("persists a multi-select question with its full correct set when allowMultiSelect is set", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [
        generated({
          options: ["a", "b", "c", "d"],
          type: "multi",
          correctAnswerIndexes: [0, 2],
        }),
      ],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
      allowMultiSelect: true,
    });

    expect(rows[0]!.type).toBe("multi");
    expect(rows[0]!.correctAnswerIndexes).toEqual([0, 2]);
    expect(rows[0]!.correctAnswerIndex).toBe(0);
  });

  it("never persists a multi-select question when allowMultiSelect is not set, even if the model returned one", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [
        generated({
          options: ["a", "b", "c"],
          type: "multi",
          correctAnswerIndexes: [0, 1],
          correctAnswerIndex: 0,
        }),
      ],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
      allowMultiSelect: false,
    });

    expect(rows[0]!.type).toBe("single");
    expect(rows[0]!.correctAnswerIndexes).toBeNull();
  });

  it("downgrades a multi-select question to single when correctAnswerIndexes is empty or invalid after clamping", () => {
    const rows = buildQuestionRows({
      sessionId: "s1",
      generated: [
        generated({
          options: ["a", "b"],
          type: "multi",
          correctAnswerIndexes: [],
          correctAnswerIndex: 1,
        }),
      ],
      defaultTopicId: "t",
      topicIdByTitle: new Map(),
      gapIdByKey: new Map(),
      makeId: (i) => `q${i}`,
      allowMultiSelect: true,
    });

    expect(rows[0]!.type).toBe("single");
    expect(rows[0]!.correctAnswerIndexes).toBeNull();
    expect(rows[0]!.correctAnswerIndex).toBe(1);
  });
});
