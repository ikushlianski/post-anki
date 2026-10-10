import { describe, expect, it } from "vitest";
import { deriveLeechOutcome, isLeech } from "./knowledge-bit-grade-schedule-leech.js";

describe("deriveLeechOutcome", () => {
  it("should suspend a card the moment it is forgotten for the 8th time", () => {
    expect(deriveLeechOutcome(7, 8)).toEqual({ leech: true, autoSuspend: true });
  });

  it("should flag but not suspend again on the 9th forgetting", () => {
    expect(deriveLeechOutcome(8, 9)).toEqual({ leech: true, autoSuspend: false });
  });

  it("should suspend again on the 12th forgetting", () => {
    expect(deriveLeechOutcome(11, 12).autoSuspend).toBe(true);
  });

  it("should never suspend when the failure count did not change", () => {
    expect(deriveLeechOutcome(8, 8)).toEqual({ leech: true, autoSuspend: false });
  });

  it("should not flag a card with few failures", () => {
    expect(deriveLeechOutcome(2, 3)).toEqual({ leech: false, autoSuspend: false });
    expect(isLeech(7)).toBe(false);
  });
});
