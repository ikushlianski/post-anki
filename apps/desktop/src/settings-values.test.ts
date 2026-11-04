import { describe, expect, it } from "vitest";
import {
  formatSteps,
  parseExamDate,
  parseRetentionPercent,
  parseSteps,
  parseWholeInRange,
  retentionToPercent,
  stepsEqual,
} from "@/settings-values";

const RANGE = { min: 1, max: 200 };

describe("parseWholeInRange", () => {
  it("should accept a whole number inside the range and trim spaces around it", () => {
    expect(parseWholeInRange(" 20 ", RANGE, "bad")).toEqual({ ok: true, value: 20 });
  });

  it("should refuse an empty value instead of reading it as zero", () => {
    expect(parseWholeInRange("  ", RANGE, "bad")).toEqual({ ok: false, message: "bad" });
  });

  it("should refuse a decimal or an out-of-range number", () => {
    expect(parseWholeInRange("2.5", RANGE, "bad").ok).toBe(false);
    expect(parseWholeInRange("201", RANGE, "bad").ok).toBe(false);
  });
});

describe("parseSteps", () => {
  it("should split a comma or space separated list into minutes", () => {
    expect(parseSteps("1, 10 30")).toEqual({ ok: true, value: [1, 10, 30] });
  });

  it("should refuse an empty steps list so a card is never scheduled with no gap", () => {
    expect(parseSteps("   ").ok).toBe(false);
  });

  it("should refuse more than ten gaps", () => {
    expect(parseSteps("1 1 1 1 1 1 1 1 1 1 1").ok).toBe(false);
  });

  it("should refuse a gap longer than a day", () => {
    expect(parseSteps("1, 1441").ok).toBe(false);
  });
});

describe("formatSteps and stepsEqual", () => {
  it("should show steps as a comma list and compare them in order", () => {
    expect(formatSteps([1, 10])).toBe("1, 10");
    expect(stepsEqual([1, 10], [10, 1])).toBe(false);
    expect(stepsEqual([1, 10], [1, 10])).toBe(true);
  });
});

describe("retention percent", () => {
  it("should convert a percent typed by the user into the stored fraction", () => {
    expect(parseRetentionPercent("90")).toEqual({ ok: true, value: 0.9 });
  });

  it("should refuse a retention outside 70 to 99 percent", () => {
    expect(parseRetentionPercent("69").ok).toBe(false);
    expect(parseRetentionPercent("100").ok).toBe(false);
  });

  it("should show a stored fraction as a whole percent", () => {
    expect(retentionToPercent(0.95)).toBe("95");
  });
});

describe("parseExamDate", () => {
  it("should accept a calendar date written as year-month-day", () => {
    expect(parseExamDate("2027-06-15")).toEqual({ ok: true, value: "2027-06-15" });
  });

  it("should refuse a date that is missing or not in year-month-day order", () => {
    expect(parseExamDate("").ok).toBe(false);
    expect(parseExamDate("15/06/2027").ok).toBe(false);
  });
});
