import { describe, expect, it } from "vitest";
import { applyGradeToCounts, countBucketFor, formatInterval } from "@/review-counts";

const counts = { new: 4, learning: 2, review: 9 };

describe("applyGradeToCounts", () => {
  it("should lower the new count when a new card is graded", () => {
    expect(applyGradeToCounts(counts, "new", -1)).toEqual({ new: 3, learning: 2, review: 9 });
  });

  it("should count relearning cards under learning", () => {
    expect(countBucketFor("relearning")).toBe("learning");
    expect(applyGradeToCounts(counts, "relearning", -1)).toEqual({ new: 4, learning: 1, review: 9 });
  });

  it("should give the count back when a grade is undone", () => {
    expect(applyGradeToCounts(counts, "review", 1)).toEqual({ new: 4, learning: 2, review: 10 });
  });

  it("should never show a negative count", () => {
    expect(applyGradeToCounts({ new: 0, learning: 0, review: 0 }, "new", -1).new).toBe(0);
  });
});

describe("formatInterval", () => {
  it("should show seconds under a minute as less than a minute", () => {
    expect(formatInterval(30)).toBe("<1m");
  });

  it("should pick minutes, hours, days and months by size", () => {
    expect(formatInterval(600)).toBe("10m");
    expect(formatInterval(7200)).toBe("2h");
    expect(formatInterval(3 * 86400)).toBe("3d");
    expect(formatInterval(60 * 86400)).toBe("2mo");
  });
});
