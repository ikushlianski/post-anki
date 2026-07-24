import { describe, it, expect } from "vitest";
import { scaleTopicQuizTotal } from "./quiz-size";

describe("scaleTopicQuizTotal", () => {
  it("scales the batch size up for a topic with many open gaps", () => {
    const small = scaleTopicQuizTotal(2, 10);
    const large = scaleTopicQuizTotal(40, 10);

    expect(large).toBeGreaterThan(small);
  });

  it("never returns fewer than the given floor, even with no gaps", () => {
    expect(scaleTopicQuizTotal(0, 10)).toBe(10);
    expect(scaleTopicQuizTotal(1, 10)).toBe(10);
  });

  it("has no hardcoded ceiling — a very gap-heavy topic keeps growing", () => {
    const total = scaleTopicQuizTotal(200, 10);

    expect(total).toBeGreaterThan(50);
  });

  it("returns a whole number of questions", () => {
    const total = scaleTopicQuizTotal(17, 10);

    expect(Number.isInteger(total)).toBe(true);
  });
});
