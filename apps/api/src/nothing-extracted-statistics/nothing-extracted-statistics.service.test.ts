import { describe, expect, it } from "vitest";
import { buildNothingExtractedWeekly } from "./nothing-extracted-statistics.service.js";

const NOW = new Date("2026-10-29T10:00:00Z");

describe("buildNothingExtractedWeekly", () => {
  it("should always return 12 weeks ending on the current ISO week with zero rate when nothing was processed", () => {
    const weekly = buildNothingExtractedWeekly([], NOW);

    expect(weekly).toHaveLength(12);
    expect(weekly.at(-1)?.weekStart).toBe("2026-10-26");
    expect(weekly[0]?.weekStart).toBe("2026-08-10");
    expect(weekly.every((week) => week.processed === 0 && week.rate === 0)).toBe(true);
  });

  it("should report the share of processed notes that yielded no cards for the matching week", () => {
    const weekly = buildNothingExtractedWeekly(
      [{ weekStart: "2026-10-19", processed: 8, nothingExtracted: 2 }],
      NOW,
    );
    const week = weekly.find((candidate) => candidate.weekStart === "2026-10-19");

    expect(week).toEqual({ weekStart: "2026-10-19", processed: 8, nothingExtracted: 2, rate: 0.25 });
  });
});
