import { describe, expect, it } from "vitest";
import { buildWeeklyTrend, weeklyWindowStart } from "./reject-reasons-weekly.js";

const now = new Date("2026-10-29T10:00:00Z");

describe("buildWeeklyTrend", () => {
  it("should return twelve UTC Monday weeks oldest first ending with the current week", () => {
    const weeks = buildWeeklyTrend([], [], now);

    expect(weeks).toHaveLength(12);
    expect(weeks[11]?.weekStart).toBe("2026-10-26");
    expect(weeks[0]?.weekStart).toBe("2026-08-10");
    expect(weeklyWindowStart(now).toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(weeks.every((w) => w.decided === 0 && w.rejectRate === 0)).toBe(true);
  });

  it("should compute reject rate from all decisions and track only the given top reasons", () => {
    const weeks = buildWeeklyTrend(
      [
        { weekStart: "2026-10-26", rejected: false, reasonCode: null, count: 6 },
        { weekStart: "2026-10-26", rejected: true, reasonCode: "bad_format", count: 3 },
        { weekStart: "2026-10-26", rejected: true, reasonCode: null, count: 1 },
        { weekStart: "2026-10-26", rejected: true, reasonCode: "text_recall_only", count: 2 },
      ],
      ["bad_format", "unspecified"],
      now,
    );
    const week = weeks[11];

    expect(week?.decided).toBe(12);
    expect(week?.rejected).toBe(6);
    expect(week?.rejectRate).toBeCloseTo(0.5);
    expect(week?.topReasons).toEqual([
      { reasonCode: "bad_format", count: 3 },
      { reasonCode: "unspecified", count: 1 },
    ]);
  });
});
