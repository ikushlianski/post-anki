import { describe, expect, it } from "vitest";
import {
  computeCourseRefocusCandidatesForSubject,
  isRefocusSuppressedByDismissal,
} from "./course-refocus.js";

interface TestCourse {
  id: string;
  order: number;
  learningStatus: string;
  createdAt: Date;
  lastStudiedAt: Date | null;
}

describe("computeCourseRefocusCandidatesForSubject", () => {
  const now = new Date("2026-08-14T00:00:00Z");
  const thresholds = {
    staleDays: 14,
    recentDays: 7,
    activeWindowDays: 3,
  };

  it("Scenario 1: stale top-priority course triggers when learner active elsewhere", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "not_started", createdAt: new Date("2026-08-01"), lastStudiedAt: null },
      { id: "c3", order: 3, learningStatus: "in_progress", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-01") },
      { id: "c4", order: 4, learningStatus: "not_started", createdAt: new Date("2026-08-10"), lastStudiedAt: null },
      { id: "c5", order: 5, learningStatus: "in_progress", createdAt: new Date("2026-07-15"), lastStudiedAt: new Date("2026-08-05") },
      { id: "c6", order: 6, learningStatus: "in_progress", createdAt: new Date("2026-06-01"), lastStudiedAt: new Date("2026-08-10") },
    ];
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

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
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

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
    const mostRecentActivityAnywhere = null;

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 6: done/skipping courses excluded", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "done", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
      { id: "c2", order: 2, learningStatus: "open", createdAt: new Date("2026-07-01"), lastStudiedAt: new Date("2026-08-10") },
    ];
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 8: single-course subject is treated as top priority", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-07-25") },
    ];
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

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
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

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
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 17: dead zone—course created 10 days ago, never studied", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "not_started", createdAt: new Date("2026-08-04"), lastStudiedAt: null },
    ];
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

    expect(result).toHaveLength(0);
  });

  it("Scenario 18: course studied 13 days ago doesn't trigger (threshold is 14)", () => {
    const courses: TestCourse[] = [
      { id: "c1", order: 1, learningStatus: "in_progress", createdAt: new Date("2026-06-15"), lastStudiedAt: new Date("2026-08-01") },
    ];
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

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
    const mostRecentActivityAnywhere = new Date("2026-08-12T00:00:00Z");

    const result = computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds);

    const staleCourseIds = result.filter((c) => c.reason === "stale_top_priority").map((c) => c.curriculumId);
    expect(staleCourseIds).not.toContain("c4");
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
