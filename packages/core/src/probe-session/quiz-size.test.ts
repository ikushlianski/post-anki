import { describe, it, expect } from "vitest";
import { scaleTopicQuizTotal } from "./quiz-size";

describe("scaleTopicQuizTotal", () => {
  it("scales the batch size up for a topic with many open gaps", () => {
    const small = scaleTopicQuizTotal(2, 10, 20);
    const large = scaleTopicQuizTotal(9, 10, 20);

    expect(large).toBeGreaterThan(small);
  });

  it("never returns fewer than the given floor, even with no gaps", () => {
    expect(scaleTopicQuizTotal(0, 10, 20)).toBe(10);
    expect(scaleTopicQuizTotal(1, 10, 20)).toBe(10);
  });

  it("clamps to the ceiling for a very gap-heavy topic", () => {
    const total = scaleTopicQuizTotal(40, 10, 20);

    expect(total).toBe(20);
  });

  it("never returns below the floor even if a caller passes ceiling < floor", () => {
    expect(scaleTopicQuizTotal(50, 10, 5)).toBe(10);
  });

  it("returns a whole number of questions", () => {
    const total = scaleTopicQuizTotal(17, 10, 20);

    expect(Number.isInteger(total)).toBe(true);
  });
});
