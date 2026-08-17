import { describe, it, expect } from "vitest";
import { buildWeeklyDigest } from "./weekly-digest";

describe("buildWeeklyDigest", () => {
  it("assembles time-to-mastery, retention, coverage, concerns and streak into one read with no DB access", () => {
    const result = buildWeeklyDigest({
      windowDays: 7,
      timeToMastery: { count: 3, avgHours: 12, medianHours: 10 },
      retention: { count: 2, avgRate: 0.9, medianRate: 0.9 },
      coverage: [{ domainNodeId: "react-effects", name: "Effects", subjectName: "React", percent: 60, status: "progress" }],
      concerns: [{ concern: "security", open: 1, covered: 2, total: 3 }],
      streak: { currentStreak: 5, longestStreak: 9, lastActiveDate: "2026-08-08" },
    });

    expect(result).toEqual({
      windowDays: 7,
      timeToMastery: { count: 3, avgHours: 12, medianHours: 10 },
      retention: { count: 2, avgRate: 0.9, medianRate: 0.9 },
      coverage: [{ domainNodeId: "react-effects", name: "Effects", subjectName: "React", percent: 60, status: "progress" }],
      concerns: [{ concern: "security", open: 1, covered: 2, total: 3 }],
      streak: { currentStreak: 5, longestStreak: 9, lastActiveDate: "2026-08-08" },
    });
  });

  it("carries null time-to-mastery and retention through rather than fabricating a zero when no data exists in the window", () => {
    const result = buildWeeklyDigest({
      windowDays: 7,
      timeToMastery: null,
      retention: null,
      coverage: [],
      concerns: [],
      streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
    });

    expect(result.timeToMastery).toBeNull();
    expect(result.retention).toBeNull();
  });
});
