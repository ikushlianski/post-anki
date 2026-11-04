import { describe, expect, it } from "vitest";
import {
  STUDY_OVERVIEW_DEFAULT_DAYS,
  STUDY_OVERVIEW_MAX_DAYS,
  homeSummarySchema,
  studyOverviewQuerySchema,
  studyOverviewSchema,
} from "./home";

describe("homeSummarySchema", () => {
  const valid = {
    topSubjects: [{ subjectId: "s1", subjectName: "Go", lastInteractedAt: "2026-01-01", topicsTouchedLast30Days: 2 }],
    funStats: { currentStreak: 1, longestStreak: 3, topicsMastered: 0, questionsAnswered: 9 },
  };

  it("should accept a minimal summary", () => {
    expect(homeSummarySchema.safeParse(valid).success).toBe(true);
  });

  it("should reject a summary missing the fun stats", () => {
    expect(homeSummarySchema.safeParse({ topSubjects: [] }).success).toBe(false);
  });
});

describe("studyOverviewQuerySchema", () => {
  it("should default to UTC and the default window", () => {
    expect(studyOverviewQuerySchema.parse({})).toEqual({ tz: "UTC", days: STUDY_OVERVIEW_DEFAULT_DAYS });
  });

  it("should reject an unknown time zone and a window over the maximum", () => {
    expect(studyOverviewQuerySchema.safeParse({ tz: "Mars/Base" }).success).toBe(false);
    expect(studyOverviewQuerySchema.safeParse({ days: STUDY_OVERVIEW_MAX_DAYS + 1 }).success).toBe(false);
  });
});

describe("studyOverviewSchema", () => {
  const valid = {
    counts: { new: 1, learning: 0, review: 2 },
    reviewedToday: 3,
    activity: [{ date: "2026-01-02", count: 4 }],
    nextDueAt: null,
    hasCards: true,
  };

  it("should accept a minimal overview", () => {
    expect(studyOverviewSchema.safeParse(valid).success).toBe(true);
  });

  it("should reject an activity day with a malformed date", () => {
    expect(studyOverviewSchema.safeParse({ ...valid, activity: [{ date: "2 Jan", count: 1 }] }).success).toBe(false);
  });
});
