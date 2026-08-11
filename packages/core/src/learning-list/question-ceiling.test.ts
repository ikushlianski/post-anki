import { describe, it, expect } from "vitest";
import {
  FOLD_IN_QUESTION_CEILING,
  SERIES_QUESTION_CEILING_MAX,
  SERIES_QUESTION_CEILING_MIN,
} from "./generation-constants";
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
});
