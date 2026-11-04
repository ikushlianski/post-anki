import { describe, expect, it } from "vitest";
import { addLocalDays, fillDaily, fillHourly, foldAccuracy, localDateOf } from "./learning.service.js";

describe("fillDaily", () => {
  it("should list every day of the window and zero the days with no reviews", () => {
    const result = fillDaily([{ date: "2026-03-09", reviews: 4, newCards: 1, passed: 3, studyMs: 900 }], "2026-03-10", 3);

    expect(result).toEqual([
      { date: "2026-03-08", reviews: 0, newCards: 0, passed: 0, studyMs: 0 },
      { date: "2026-03-09", reviews: 4, newCards: 1, passed: 3, studyMs: 900 },
      { date: "2026-03-10", reviews: 0, newCards: 0, passed: 0, studyMs: 0 },
    ]);
  });

  it("should keep one entry per calendar day across the spring-forward gap", () => {
    const dates = fillDaily([], "2026-03-09", 4).map((row) => row.date);

    expect(dates).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"]);
  });

  it("should keep one entry per calendar day across the fall-back repeat", () => {
    const dates = fillDaily([], "2026-11-02", 3).map((row) => row.date);

    expect(dates).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("localDateOf", () => {
  it("should name the owner's local day, not the UTC day", () => {
    const now = new Date("2026-03-10T02:30:00Z");

    expect(localDateOf(now, "America/New_York")).toBe("2026-03-09");
    expect(localDateOf(now, "Asia/Tokyo")).toBe("2026-03-10");
  });

  it("should stay on the same local day right after the spring-forward jump", () => {
    expect(localDateOf(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toBe("2026-03-08");
  });
});

describe("addLocalDays", () => {
  it("should step across month and year ends", () => {
    expect(addLocalDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addLocalDays("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("fillHourly", () => {
  it("should always return 24 hours with zeros for quiet ones", () => {
    const result = fillHourly([{ hour: 9, reviews: 5 }]);

    expect(result).toHaveLength(24);
    expect(result[9]).toEqual({ hour: 9, reviews: 5 });
    expect(result[10]).toEqual({ hour: 10, reviews: 0 });
  });
});

describe("foldAccuracy", () => {
  it("should report pass rates and null when nothing was reviewed", () => {
    expect(foldAccuracy({ overallTotal: 10, overallPassed: 8, last7Total: 4, last7Passed: 1 })).toEqual({
      overall: 0.8,
      last7: 0.25,
    });
    expect(foldAccuracy({ overallTotal: 0, overallPassed: 0, last7Total: 0, last7Passed: 0 })).toEqual({
      overall: null,
      last7: null,
    });
  });
});
