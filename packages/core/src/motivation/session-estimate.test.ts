import { describe, expect, it } from "vitest";
import { estimateMinutes, masteryPercent, retentionPercent } from "./session-estimate";

describe("estimateMinutes", () => {
  it("should say zero minutes when nothing is due", () => {
    expect(estimateMinutes(0, 5000)).toBe(0);
  });

  it("should use the learner's average time per card", () => {
    expect(estimateMinutes(18, 20000)).toBe(6);
  });

  it("should fall back to a default pace without history", () => {
    expect(estimateMinutes(18, null)).toBe(3);
  });

  it("should never promise less than one minute for a non-empty preview", () => {
    expect(estimateMinutes(1, 3000)).toBe(1);
  });

  it("should ignore absurdly long single-card averages", () => {
    expect(estimateMinutes(60, 10 * 60_000)).toBe(60);
  });
});

describe("masteryPercent", () => {
  it("should round the share of solid cards", () => {
    expect(masteryPercent(1, 3)).toBe(33);
  });

  it("should be zero for a subject without cards", () => {
    expect(masteryPercent(0, 0)).toBe(0);
  });
});

describe("retentionPercent", () => {
  it("should be unknown without older reviews", () => {
    expect(retentionPercent(0, 0)).toBeNull();
  });

  it("should be the share of older cards still recalled", () => {
    expect(retentionPercent(9, 10)).toBe(90);
  });
});
