import { describe, expect, it } from "vitest";
import {
  computeCourseRefocusCandidatesForSubject,
  hasSustainedEngagementElsewhere,
  isRefocusSuppressedByDismissal,
} from "./course-refocus.js";

interface TestCourse {
  id: string;
  order: number;
  learningStatus: string;
  createdAt: Date;
  lastStudiedAt: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("computeCourseRefocusCandidatesForSubject", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  const thresholds = {
    staleDays: 14,
    recentDays: 7,
    activeWindowDays: 3,
  };

  const daysAgo = (days: number): Date => new Date(now.getTime() - days * MS_PER_DAY);

  const stillStudyingElsewhere = [daysAgo(1), daysAgo(5), daysAgo(9)];

  it("Scenario 1: stale top-priority course triggers when learner keeps studying elsewhere", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "not_started", createdAt: new Date("2026-08-01"), lastStudiedAt: null },
      { id: "c3", order: 3, learningStatus: "in_progress", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-01") },
      { id: "c4", order: 4, learningStatus: "not_started", createdAt: new Date("2026-08-10"), lastStudiedAt: null },
      { id: "c5", order: 5, learningStatus: "in_progress", createdAt: new Date("2026-07-15"), lastStudiedAt: new Date("2026-08-05") },
      { id: "c6", order: 6, learningStatus: "in_progress", createdAt: new Date("2026-06-01"), lastStudiedAt: new Date("2026-08-10") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      curriculumId: "c1",
      reason: "stale_top_priority",
    });
  });

  it("Scenario 2: new high-priority course triggers", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "not_started", createdAt: new Date("2026-08-09"), lastStudiedAt: null },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      curriculumId: "c1",
      reason: "new_high_priority_ignored",
    });
  });

  it("Scenario 3: no suggestion when quiet everywhere", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, [], thresholds);

    expect(result).toHaveLength(0);
  });

  it("stays silent on the first day back after a long absence, however stale the course is", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-05-01"), lastStudiedAt: new Date("2026-07-01") },
      { id: "c2", order: 2, learningStatus: "in_progress", createdAt: new Date("2026-05-01"), lastStudiedAt: new Date("2026-07-02") },
      { id: "c3", order: 3, learningStatus: "in_progress", createdAt: new Date("2026-05-01"), lastStudiedAt: new Date("2026-07-03") },
    ];
    const oneStudySessionToday = [daysAgo(0)];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, oneStudySessionToday, thresholds);

    expect(result).toHaveLength(0);
  });

  it("stays silent about a brand-new top course too when today is the first day back", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "not_started", createdAt: new Date("2026-08-09"), lastStudiedAt: null },
    ];
    const oneStudySessionToday = [daysAgo(0)];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, oneStudySessionToday, thresholds);

    expect(result).toHaveLength(0);
  });

  it("cannot count a stale course's own last study session as proof of studying elsewhere", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: daysAgo(14) },
    ];
    const onlyThatCoursesOwnActivityPlusToday = [daysAgo(14), daysAgo(0)];

    const result = computeCourseRefocusCandidatesForSubject(
      courses,
      now,
      onlyThatCoursesOwnActivityPlusToday,
      thresholds,
    );

    expect(result).toHaveLength(0);
  });

  it("surfaces again once the learner has been back for several days", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-05-01"), lastStudiedAt: new Date("2026-07-01") },
    ];
    const backForAWeek = [daysAgo(0), daysAgo(2), daysAgo(4)];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, backForAWeek, thresholds);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ curriculumId: "c1", reason: "stale_top_priority" });
  });

  it("Scenario 6: done/skipping courses excluded", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "done", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "open", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-10") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 8: single-course subject is treated as top priority", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      curriculumId: "c1",
      reason: "stale_top_priority",
    });
  });

  it("Scenario 12: multiple stale courses in top band", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "in_progress", createdAt: new Date("2026-06-20"), lastStudiedAt: new Date("2026-07-28") },
      { id: "c3", order: 3, learningStatus: "in_progress", createdAt: new Date("2026-07-10"), lastStudiedAt: new Date("2026-08-10") },
      { id: "c4", order: 4, learningStatus: "in_progress", createdAt: new Date("2026-07-15"), lastStudiedAt: new Date("2026-08-05") },
      { id: "c5", order: 5, learningStatus: "in_progress", createdAt: new Date("2026-06-01"), lastStudiedAt: new Date("2026-07-20") },
      { id: "c6", order: 6, learningStatus: "in_progress", createdAt: new Date("2026-06-10"), lastStudiedAt: new Date("2026-07-22") },
      { id: "c7", order: 7, learningStatus: "in_progress", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-08") },
      { id: "c8", order: 8, learningStatus: "in_progress", createdAt: new Date("2026-07-05"), lastStudiedAt: new Date("2026-08-11") },
      { id: "c9", order: 9, learningStatus: "in_progress", createdAt: new Date("2026-07-20"), lastStudiedAt: new Date("2026-08-12") },
      { id: "c10", order: 10, learningStatus: "in_progress", createdAt: new Date("2026-07-25"), lastStudiedAt: new Date("2026-08-13") },
      { id: "c11", order: 11, learningStatus: "in_progress", createdAt: new Date("2026-07-28"), lastStudiedAt: new Date("2026-08-12") },
      { id: "c12", order: 12, learningStatus: "in_progress", createdAt: new Date("2026-07-30"), lastStudiedAt: new Date("2026-08-11") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    const staleCourseIds = result.filter((c) => c.reason === "stale_top_priority").map((c) => c.curriculumId);
    expect(staleCourseIds).toContain("c1");
    expect(staleCourseIds).toContain("c2");
    expect(staleCourseIds).not.toContain("c5");
  });

  it("Scenario 13: subject with zero eligible courses produces empty array", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "done", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "skipped", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-10") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 17: dead zone—course created 10 days ago, never studied", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "not_started", createdAt: new Date("2026-08-04"), lastStudiedAt: null },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 18: course studied 13 days ago doesn't trigger (threshold is 14)", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-08-01") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 19: rank below top-band doesn't trigger even if stale (9-course subject, topBandSize=3)", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "in_progress", createdAt: new Date("2026-06-20"), lastStudiedAt: new Date("2026-08-10") },
      { id: "c3", order: 3, learningStatus: "in_progress", createdAt: new Date("2026-07-10"), lastStudiedAt: new Date("2026-08-05") },
      { id: "c4", order: 4, learningStatus: "in_progress", createdAt: new Date("2026-06-01"), lastStudiedAt: new Date("2026-07-20") },
      { id: "c5", order: 5, learningStatus: "in_progress", createdAt: new Date("2026-06-10"), lastStudiedAt: new Date("2026-07-22") },
      { id: "c6", order: 6, learningStatus: "in_progress", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-08") },
      { id: "c7", order: 7, learningStatus: "in_progress", createdAt: new Date("2026-07-05"), lastStudiedAt: new Date("2026-08-11") },
      { id: "c8", order: 8, learningStatus: "in_progress", createdAt: new Date("2026-07-20"), lastStudiedAt: new Date("2026-08-12") },
      { id: "c9", order: 9, learningStatus: "in_progress", createdAt: new Date("2026-07-25"), lastStudiedAt: new Date("2026-08-13") },
    ];

    const result = computeCourseRefocusCandidatesForSubject(courses, now, stillStudyingElsewhere, thresholds);

    const staleCourseIds = result.filter((c) => c.reason === "stale_top_priority").map((c) => c.curriculumId);
    expect(staleCourseIds).not.toContain("c4");
  });
});

describe("hasSustainedEngagementElsewhere", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  const thresholds = {
    staleDays: 14,
    recentDays: 7,
    activeWindowDays: 3,
  };

  const daysAgo = (days: number): Date => new Date(now.getTime() - days * MS_PER_DAY);

  it("treats a single session after weeks away as not-yet-engaged", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(0)], now, thresholds)).toBe(false);
  });

  it("treats studying today plus earlier in the fortnight as engaged", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(0), daysAgo(8)], now, thresholds)).toBe(true);
  });

  it("treats a burst confined to the last three days as not-yet-engaged", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(0), daysAgo(1), daysAgo(3)], now, thresholds)).toBe(false);
  });

  it("treats someone who stopped studying a week ago as not currently around", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(7), daysAgo(9)], now, thresholds)).toBe(false);
  });

  it("ignores activity that is itself older than the staleness threshold", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(0), daysAgo(14)], now, thresholds)).toBe(false);
  });

  it("counts activity from the day just outside the active window", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(0), daysAgo(4)], now, thresholds)).toBe(true);
  });

  it("counts activity from the last day inside the staleness window", () => {
    expect(hasSustainedEngagementElsewhere([daysAgo(0), daysAgo(13)], now, thresholds)).toBe(true);
  });

  it("is never engaged with no activity at all", () => {
    expect(hasSustainedEngagementElsewhere([], now, thresholds)).toBe(false);
  });
});

describe("isRefocusSuppressedByDismissal", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  const cooldownDays = 7;

  it("Scenario 4: dismissal suppressed at day 4 (within cooldown)", () => {
    const dismissedAt = new Date("2026-08-10T00:00:00Z");

    const result = isRefocusSuppressedByDismissal(dismissedAt, now, cooldownDays);

    expect(result).toBe(true);
  });

  it("Scenario 4: dismissal expired at day 8 (outside cooldown)", () => {
    const dismissedAt = new Date("2026-08-06T00:00:00Z");

    const result = isRefocusSuppressedByDismissal(dismissedAt, now, cooldownDays);

    expect(result).toBe(false);
  });

  it("Scenario 4: dismissal boundary at exactly day 7 (inclusive suppression)", () => {
    const dismissedAt = new Date("2026-08-07T00:00:00Z");

    const result = isRefocusSuppressedByDismissal(dismissedAt, now, cooldownDays);

    expect(result).toBe(true);
  });

  it("dismissal with null dismissedAt is not suppressed", () => {
    const result = isRefocusSuppressedByDismissal(null, now, cooldownDays);

    expect(result).toBe(false);
  });
});
