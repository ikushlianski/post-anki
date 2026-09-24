import { describe, expect, it } from "vitest";
import { computeNextSchedule } from "./knowledge-bit-schedule.repo.js";

describe("computeNextSchedule", () => {
  it("grows the interval and ease for a first-time correct answer", () => {
    const next = computeNextSchedule({ easeFactor: 2.5, intervalDays: 0 }, "Ok");

    expect(next).toEqual({ easeFactor: 2.6, intervalDays: 2.5 });
  });

  it("keeps growing the interval by ease factor on repeated correct answers", () => {
    const first = computeNextSchedule({ easeFactor: 2.5, intervalDays: 0 }, "Ok");
    const second = computeNextSchedule(first, "Ok");

    expect(second.intervalDays).toBeCloseTo(2.5 * 2.6, 5);
    expect(second.easeFactor).toBeCloseTo(2.7, 5);
  });

  it("grows the interval only a little and lowers ease for a shaky answer", () => {
    const next = computeNextSchedule({ easeFactor: 2.5, intervalDays: 10 }, "NeedsReview");

    expect(next.intervalDays).toBeCloseTo(12, 5);
    expect(next.easeFactor).toBeCloseTo(2.45, 5);
  });

  it("caps a chronically shaky bit's interval well below the full-mastery ceiling, so it does not get skimmed past", () => {
    const next = computeNextSchedule({ easeFactor: 2.5, intervalDays: 100 }, "NeedsReview");

    expect(next.intervalDays).toBe(14);
  });

  it("resets the interval short and drops ease harder on a failed answer, so it does not get skimmed past", () => {
    const next = computeNextSchedule({ easeFactor: 2.5, intervalDays: 30 }, "NeedsDeepDive");

    expect(next.intervalDays).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.3, 5);
  });

  it("never drops ease below the floor even after repeated failures", () => {
    let state = { easeFactor: 1.4, intervalDays: 5 };

    state = computeNextSchedule(state, "NeedsDeepDive");
    state = computeNextSchedule(state, "NeedsDeepDive");

    expect(state.easeFactor).toBe(1.3);
  });

  it("never grows the interval past the cap, avoiding an ever-more-distant due date", () => {
    const next = computeNextSchedule({ easeFactor: 3.0, intervalDays: 170 }, "Ok");

    expect(next.intervalDays).toBe(180);
  });
});
