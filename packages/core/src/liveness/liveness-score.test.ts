import { describe, expect, it } from "vitest";
import { LIVENESS_MAX_SCORE, LIVENESS_MIN_SCORE } from "./liveness-constants.js";
import { clampLivenessScore } from "./liveness-score.js";

describe("clampLivenessScore", () => {
  it("should never let a score fall below the minimum", () => {
    expect(clampLivenessScore(-5)).toBe(LIVENESS_MIN_SCORE);
    expect(clampLivenessScore(0.4)).toBe(LIVENESS_MIN_SCORE);
  });

  it("should never let a score rise above the maximum", () => {
    expect(clampLivenessScore(42)).toBe(LIVENESS_MAX_SCORE);
    expect(clampLivenessScore(10.4)).toBe(LIVENESS_MAX_SCORE);
  });

  it("should keep in-range scores as whole numbers", () => {
    expect(clampLivenessScore(6.6)).toBe(7);
    expect(clampLivenessScore(5)).toBe(5);
  });

  it("should keep the boundary scores unchanged", () => {
    expect(clampLivenessScore(LIVENESS_MIN_SCORE)).toBe(LIVENESS_MIN_SCORE);
    expect(clampLivenessScore(LIVENESS_MAX_SCORE)).toBe(LIVENESS_MAX_SCORE);
  });
});
