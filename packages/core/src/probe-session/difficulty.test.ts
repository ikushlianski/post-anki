import { describe, it, expect } from "vitest";
import { selectQuizDifficultyMix } from "./difficulty";

describe("selectQuizDifficultyMix", () => {
  it("returns no questions for a zero total", () => {
    expect(selectQuizDifficultyMix(null, 0)).toEqual({ easy: 0, medium: 0, hard: 0 });
  });

  it("leans easy for a brand-new topic with no prior score", () => {
    const mix = selectQuizDifficultyMix(null, 20);

    expect(mix.easy).toBeGreaterThan(mix.hard);
  });

  it("leans hard when the basics are already solid", () => {
    const mix = selectQuizDifficultyMix(90, 20);

    expect(mix.hard).toBeGreaterThan(mix.easy);
  });

  it("always preserves the requested total", () => {
    [1, 10, 16, 20].forEach((total) => {
      [null, 10, 60, 90].forEach((maturity) => {
        const mix = selectQuizDifficultyMix(maturity, total);

        expect(mix.easy + mix.medium + mix.hard).toBe(total);
      });
    });
  });
});
