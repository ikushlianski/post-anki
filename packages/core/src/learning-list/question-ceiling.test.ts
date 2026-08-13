import { describe, it, expect } from "vitest";
import {
  FOLD_IN_QUESTION_CEILING,
  QUESTIONS_PER_KNOWN_SERIES_PART,
  SERIES_QUESTION_CEILING_MAX,
  SERIES_QUESTION_CEILING_MIN,
} from "./generation-constants";
import { nextIngestionSlice } from "./ingestion-slice";
import { planQuestionCeiling } from "./question-ceiling";

describe("planQuestionCeiling", () => {
  describe("a single article folded into an Area", () => {
    it("earns only a handful of questions, never the mini-course budget", () => {
      expect(planQuestionCeiling("single", 1)).toBe(FOLD_IN_QUESTION_CEILING);
      expect(planQuestionCeiling("single", 1)).toBeLessThan(SERIES_QUESTION_CEILING_MIN);
    });

    it("keeps the same small budget no matter how many sibling pages were seen", () => {
      expect(planQuestionCeiling("single", 9)).toBe(FOLD_IN_QUESTION_CEILING);
    });
  });

  describe("a page parked for the user to decide", () => {
    it("gets the fold-in budget, because parking is a status gate rather than a zero budget", () => {
      expect(planQuestionCeiling("unknown", 8)).toBe(FOLD_IN_QUESTION_CEILING);
    });
  });

  describe("a confirmed multi-part series", () => {
    it("targets the stated 20-30 question band for every part count", () => {
      const ceilings = [1, 2, 5, 7, 9, 12, 40].map((parts) =>
        planQuestionCeiling("series", parts),
      );

      for (const ceiling of ceilings) {
        expect(ceiling).toBeGreaterThanOrEqual(SERIES_QUESTION_CEILING_MIN);
        expect(ceiling).toBeLessThanOrEqual(SERIES_QUESTION_CEILING_MAX);
      }
    });

    it("gives the 9-guide AWS agentic-AI series a bigger budget than a short two-parter", () => {
      expect(planQuestionCeiling("series", 9)).toBe(27);
      expect(planQuestionCeiling("series", 9)).toBeGreaterThan(
        planQuestionCeiling("series", 2),
      );
    });

    it("never budgets a longer series below a shorter one", () => {
      const ceilings = [1, 2, 5, 7, 9, 12, 40].map((parts) =>
        planQuestionCeiling("series", parts),
      );

      expect(ceilings).toEqual([...ceilings].sort((a, b) => a - b));
    });

    it("never drops below the bottom of the band for a very short series", () => {
      expect(planQuestionCeiling("series", 2)).toBe(SERIES_QUESTION_CEILING_MIN);
    });

    it("never exceeds the top of the band for a sprawling series", () => {
      expect(planQuestionCeiling("series", 40)).toBe(SERIES_QUESTION_CEILING_MAX);
    });

    it("still budgets a real course when the part count could not be counted", () => {
      expect(planQuestionCeiling("series", 0)).toBe(SERIES_QUESTION_CEILING_MIN);
      expect(planQuestionCeiling("series", Number.NaN)).toBe(SERIES_QUESTION_CEILING_MIN);
      expect(planQuestionCeiling("series", -3)).toBe(SERIES_QUESTION_CEILING_MIN);
    });
  });

  describe("a series whose parts are genuinely known — discovered and verified, not guessed", () => {
    it("raises a twelve-chapter book's ceiling past the old clamp so every module can fill", () => {
      const ceiling = planQuestionCeiling("series", 12, 12);

      expect(ceiling).toBe(12 * QUESTIONS_PER_KNOWN_SERIES_PART);
      expect(ceiling).toBeGreaterThan(SERIES_QUESTION_CEILING_MAX);
    });

    it("never lowers the ceiling below what the unverified partCount guess would have given", () => {
      expect(planQuestionCeiling("series", 40, 1)).toBe(SERIES_QUESTION_CEILING_MAX);
    });

    it("ignores a null, zero, or negative known part count and falls back to the clamped guess", () => {
      expect(planQuestionCeiling("series", 9, null)).toBe(planQuestionCeiling("series", 9));
      expect(planQuestionCeiling("series", 9, 0)).toBe(planQuestionCeiling("series", 9));
      expect(planQuestionCeiling("series", 9, -2)).toBe(planQuestionCeiling("series", 9));
    });

    it("gives the AWS nine-guide series enough budget to fill every guide, not just five", () => {
      const ceiling = planQuestionCeiling("series", 9, 9);

      expect(ceiling).toBe(54);
      expect(ceiling).toBeGreaterThan(SERIES_QUESTION_CEILING_MAX);
    });

    it("has no effect outside a series verdict", () => {
      expect(planQuestionCeiling("single", 1, 12)).toBe(FOLD_IN_QUESTION_CEILING);
    });
  });
});

describe("a known-parts ceiling never overrides the liveness gate", () => {
  it("still refuses to release a slice for a cold topic, no matter how high the ceiling is", () => {
    const knownPartsCeiling = planQuestionCeiling("series", 12, 12);

    expect(knownPartsCeiling).toBeGreaterThan(SERIES_QUESTION_CEILING_MAX);

    const slice = nextIngestionSlice(
      {
        liveness: 0,
        questionsAlreadyGenerated: 0,
        ceiling: knownPartsCeiling,
        lastReleasedAt: null,
      },
      "2026-01-01T00:00:00.000Z",
    );

    expect(slice).toBeNull();
  });
});
