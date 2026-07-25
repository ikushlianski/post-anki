import { describe, it, expect, vi } from "vitest";
import { buildGradeBatchPrompt, toAttemptRows, type GradeItem } from "./grade-attempts.orchestrator.js";
import type { GradeBatch } from "./practice-batch.schemas.js";

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { gradeBatch: "gradeBatch" },
  getMastra: () => ({ getAgent: () => ({ generate: vi.fn() }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("buildGradeBatchPrompt", () => {
  describe("with multiple items", () => {
    const items: GradeItem[] = [
      { russian: "Привет", referenceEnglish: "Hey there", userAnswer: "Hi" },
      { russian: "Пока", referenceEnglish: "See ya", userAnswer: "Bye bye" },
    ];

    it("includes the level and every item in order, numbered from 1", () => {
      const prompt = buildGradeBatchPrompt("B1_B2", items);

      expect(prompt).toContain("Level: B1_B2");
      expect(prompt).toContain("Item 1:");
      expect(prompt).toContain("Russian: Привет");
      expect(prompt).toContain("Reference native translation: Hey there");
      expect(prompt).toContain("Learner's answer: Hi");
      expect(prompt).toContain("Item 2:");
      expect(prompt).toContain("Russian: Пока");
      expect(prompt).toContain("Learner's answer: Bye bye");
    });

    it("instructs the agent to grade in order and return the same count", () => {
      const prompt = buildGradeBatchPrompt("B1_B2", items);

      expect(prompt).toContain("Grade each item independently, in the same order given");
      expect(prompt).toContain("Return exactly 2 graded results, in the same order.");
    });

    it("places item 1 before item 2 in the rendered prompt", () => {
      const prompt = buildGradeBatchPrompt("B1_B2", items);

      expect(prompt.indexOf("Item 1:")).toBeLessThan(prompt.indexOf("Item 2:"));
    });
  });
});

describe("toAttemptRows", () => {
  const ORIGINAL_ANSWERS = [
    { phraseId: "phr_a", userAnswer: "Hi there" },
    { phraseId: "phr_b", userAnswer: "See ya later" },
    { phraseId: "phr_c", userAnswer: "Grab some milk" },
  ];

  const GRADED: GradeBatch = {
    gradedAnswers: [
      { score: 9, verdict: "Ok", feedback: "Natural.", nativeAlternatives: ["Hey!"] },
      { score: 6, verdict: "NeedsReview", feedback: "A bit stiff.", nativeAlternatives: ["Later!", "Catch ya later"] },
      { score: 3, verdict: "NeedsDeepDive", feedback: "Wrong meaning.", nativeAlternatives: ["Pick up some milk"] },
    ],
  };

  describe("reattaching grades to phrases positionally", () => {
    it("zips each graded answer with the original answer at the same index", () => {
      const rows = toAttemptRows("sub_1", GRADED, ORIGINAL_ANSWERS, (index) => `att_${index}`);

      expect(rows).toEqual([
        {
          id: "att_0",
          subjectId: "sub_1",
          phraseId: "phr_a",
          userAnswer: "Hi there",
          score: 9,
          verdict: "Ok",
          feedback: "Natural.",
          nativeAlternatives: ["Hey!"],
        },
        {
          id: "att_1",
          subjectId: "sub_1",
          phraseId: "phr_b",
          userAnswer: "See ya later",
          score: 6,
          verdict: "NeedsReview",
          feedback: "A bit stiff.",
          nativeAlternatives: ["Later!", "Catch ya later"],
        },
        {
          id: "att_2",
          subjectId: "sub_1",
          phraseId: "phr_c",
          userAnswer: "Grab some milk",
          score: 3,
          verdict: "NeedsDeepDive",
          feedback: "Wrong meaning.",
          nativeAlternatives: ["Pick up some milk"],
        },
      ]);
    });

    it("does not attribute a grade to the wrong phrase when scores are unsorted relative to order", () => {
      const rows = toAttemptRows("sub_1", GRADED, ORIGINAL_ANSWERS, (index) => `att_${index}`);

      const byPhrase = new Map(rows.map((r) => [r.phraseId, r]));

      expect(byPhrase.get("phr_a")!.score).toBe(9);
      expect(byPhrase.get("phr_b")!.score).toBe(6);
      expect(byPhrase.get("phr_c")!.score).toBe(3);
    });
  });

  describe("when the agent returns fewer graded answers than submitted", () => {
    it("only produces rows for the answers that were actually graded", () => {
      const partial: GradeBatch = { gradedAnswers: [GRADED.gradedAnswers[0]!] };
      const rows = toAttemptRows("sub_1", partial, ORIGINAL_ANSWERS, (index) => `att_${index}`);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.phraseId).toBe("phr_a");
    });
  });

  describe("when the agent returns more graded answers than submitted", () => {
    it("ignores the extra graded answers", () => {
      const twoAnswers = ORIGINAL_ANSWERS.slice(0, 2);
      const rows = toAttemptRows("sub_1", GRADED, twoAnswers, (index) => `att_${index}`);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.phraseId)).toEqual(["phr_a", "phr_b"]);
    });
  });

  describe("with no answers submitted", () => {
    it("produces no rows", () => {
      const rows = toAttemptRows("sub_1", GRADED, [], (index) => `att_${index}`);

      expect(rows).toEqual([]);
    });
  });
});
