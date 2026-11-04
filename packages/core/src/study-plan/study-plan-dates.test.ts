import { describe, expect, it } from "vitest";
import { addLocalDays, diffLocalDays } from "./study-plan-dates.js";

describe("addLocalDays", () => {
  it("should roll over to the next month at a month end", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("should include 29 February in a leap year", () => {
    expect(addLocalDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addLocalDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("should skip 29 February in a non-leap year", () => {
    expect(addLocalDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("should roll over the year boundary in both directions", () => {
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("should return the same date for zero days", () => {
    expect(addLocalDays("2026-06-15", 0)).toBe("2026-06-15");
  });
});

describe("diffLocalDays", () => {
  it("should count a leap day as a full day", () => {
    expect(diffLocalDays("2028-03-01", "2028-02-28")).toBe(2);
    expect(diffLocalDays("2026-03-01", "2026-02-28")).toBe(1);
  });

  it("should count days across a year change", () => {
    expect(diffLocalDays("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("should be negative when the first date is earlier", () => {
    expect(diffLocalDays("2026-01-01", "2026-01-31")).toBe(-30);
  });

  it("should be zero for the same date", () => {
    expect(diffLocalDays("2026-05-05", "2026-05-05")).toBe(0);
  });
});
