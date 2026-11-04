import { describe, expect, it } from "vitest";
import {
  currentPeriodKey,
  isPeriodKeyReal,
  isoWeekKeyOf,
  periodLocalRange,
} from "./study-goal-periods";

describe("study goal periods", () => {
  it("should count 2026-12-31 as the last day of ISO week 53 of 2026", () => {
    expect(isoWeekKeyOf(2026, 12, 31)).toBe("2026-W53");
  });

  it("should put 2027-01-01 in the same ISO week as the days before the year boundary", () => {
    expect(isoWeekKeyOf(2027, 1, 1)).toBe("2026-W53");
  });

  it("should start ISO week 1 of 2026 on Monday 2025-12-29", () => {
    expect(periodLocalRange("week", "2026-W01")).toEqual({ start: "2025-12-29", end: "2026-01-05" });
  });

  it("should end a December month range on the first of January", () => {
    expect(periodLocalRange("month", "2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("should cover a whole calendar year", () => {
    expect(periodLocalRange("year", "2026")).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });

  it("should reject week 53 for a year that only has 52 ISO weeks", () => {
    expect(isPeriodKeyReal("week", "2027-W53")).toBe(false);
    expect(isPeriodKeyReal("week", "2026-W53")).toBe(true);
  });

  it("should use the learner's local date for the current period near UTC midnight", () => {
    const now = new Date("2026-10-31T23:30:00.000Z");

    expect(currentPeriodKey("month", now, "UTC")).toBe("2026-10");
    expect(currentPeriodKey("month", now, "Asia/Tokyo")).toBe("2026-11");
    expect(currentPeriodKey("month", now, "America/Los_Angeles")).toBe("2026-10");
  });

  it("should give the year and week for the learner's local date at a year boundary", () => {
    const now = new Date("2026-12-31T20:00:00.000Z");

    expect(currentPeriodKey("year", now, "Pacific/Auckland")).toBe("2027");
    expect(currentPeriodKey("week", now, "Pacific/Auckland")).toBe("2026-W53");
    expect(currentPeriodKey("week", now, "UTC")).toBe("2026-W53");
  });

  it("should keep the week on the correct Monday across a daylight saving change", () => {
    expect(periodLocalRange("week", "2026-W44")).toEqual({ start: "2026-10-26", end: "2026-11-02" });
    expect(currentPeriodKey("week", new Date("2026-10-26T04:30:00.000Z"), "Europe/Berlin")).toBe("2026-W44");
  });
});
