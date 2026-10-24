import { describe, expect, it } from "vitest";
import { POINTS_PER_REVIEW, scoreReview } from "./review-points";

describe("scoreReview", () => {
  it("should pay every graded review the same flat amount", () => {
    expect(scoreReview()).toEqual({ points: POINTS_PER_REVIEW, reason: "awarded" });
    expect(POINTS_PER_REVIEW).toBe(1);
  });
});
