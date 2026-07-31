import { describe, it, expect } from "vitest";
import {
  computeCourseRefocusCandidatesForSubject,
  isRefocusSuppressedByDismissal,
  type CourseRefocusSignal,
} from "./course-refocus";

// cross-course-refocus-suggestion (issue #70), scenarios.md Scenarios 1, 2,
// 3, 4, 6, 8, 12, 13 — the two pure derivers this feature owns. `now` is
// always an explicit parameter (same allowed-wall-clock-as-parameter
// convention as isDomainPriorityReviewDue), never read internally.

const NOW = new Date("2026-07-31T12:00:00.000Z");

function daysBefore(days: number): string {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString();
}

function course(overrides: Partial<CourseRefocusSignal> & { id: string; order: number }): CourseRefocusSignal {
  return {
    createdAt: daysBefore(365),
    lastStudiedAt: null,
    learningStatus: "not_started",
    ...overrides,
  };
}

describe("computeCourseRefocusCandidatesForSubject", () => {
  describe("SCENARIO 1 — a top-priority course goes quiet while the learner keeps studying elsewhere", () => {
    it("flags a rank-1 course idle past 14 days when the learner is active elsewhere within 3 days", () => {
      const courses = [
        course({ id: "cur_a", order: 1, lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_b", order: 2, lastStudiedAt: daysBefore(1) }),
        course({ id: "cur_c", order: 3, lastStudiedAt: daysBefore(1) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates).toEqual([
        { curriculumId: "cur_a", reason: "stale_top_priority", daysSinceActivity: 20 },
      ]);
    });

    it("falls back to createdAt for a course that has never been studied", () => {
      const courses = [
        course({ id: "cur_a", order: 1, lastStudiedAt: null, createdAt: daysBefore(30) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates).toEqual([
        { curriculumId: "cur_a", reason: "stale_top_priority", daysSinceActivity: 30 },
      ]);
    });
  });

  describe("SCENARIO 2 — a newly added course sits at the top and has never been opened", () => {
    it("flags a rank-1, never-studied course created within the recent window", () => {
      const courses = [
        course({ id: "cur_a", order: 1, createdAt: daysBefore(5), lastStudiedAt: null }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates).toEqual([
        { curriculumId: "cur_a", reason: "new_high_priority_ignored", daysSinceActivity: 5 },
      ]);
    });

    it("triggers neither reason for a course created exactly 10 days ago (the documented dead zone)", () => {
      const courses = [
        course({ id: "cur_a", order: 1, createdAt: daysBefore(10), lastStudiedAt: null }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates).toEqual([]);
    });
  });

  describe("SCENARIO 3 — no suggestion when the learner has gone quiet everywhere", () => {
    it("suppresses every candidate when mostRecentActivityAnywhere is itself stale", () => {
      const courses = [
        course({ id: "cur_a", order: 1, lastStudiedAt: daysBefore(20) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(10),
      );

      expect(candidates).toEqual([]);
    });

    it("suppresses every candidate when mostRecentActivityAnywhere is null", () => {
      const courses = [
        course({ id: "cur_a", order: 1, lastStudiedAt: daysBefore(20) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(courses, NOW, null);

      expect(candidates).toEqual([]);
    });
  });

  describe("SCENARIO 6 — completed or explicitly-skipped courses never nag", () => {
    it("excludes a done course even when stale by every timestamp", () => {
      const courses = [
        course({
          id: "cur_a",
          order: 1,
          lastStudiedAt: daysBefore(20),
          learningStatus: "done",
        }),
      ];

      expect(
        computeCourseRefocusCandidatesForSubject(courses, NOW, daysBefore(1)),
      ).toEqual([]);
    });

    it("excludes a skipping course even when stale by every timestamp", () => {
      const courses = [
        course({
          id: "cur_a",
          order: 1,
          lastStudiedAt: daysBefore(20),
          learningStatus: "skipping",
        }),
      ];

      expect(
        computeCourseRefocusCandidatesForSubject(courses, NOW, daysBefore(1)),
      ).toEqual([]);
    });
  });

  describe("SCENARIO 8 — a single-course subject can still be top priority", () => {
    it("classifies the lone course as top-band", () => {
      const courses = [
        course({ id: "cur_a", order: 1, lastStudiedAt: daysBefore(20) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates).toEqual([
        { curriculumId: "cur_a", reason: "stale_top_priority", daysSinceActivity: 20 },
      ]);
    });
  });

  describe("SCENARIO 12 — two courses in the same subject's top band are stale at once", () => {
    it("produces a candidate for both rank 1 and rank 2 out of 6 eligible courses", () => {
      const courses = [
        course({ id: "cur_1", order: 1, lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_2", order: 2, lastStudiedAt: daysBefore(15) }),
        course({ id: "cur_3", order: 3, lastStudiedAt: daysBefore(1) }),
        course({ id: "cur_4", order: 4, lastStudiedAt: daysBefore(1) }),
        course({ id: "cur_5", order: 5, lastStudiedAt: daysBefore(1) }),
        course({ id: "cur_6", order: 6, lastStudiedAt: daysBefore(1) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates.map((c) => c.curriculumId).sort()).toEqual(["cur_1", "cur_2"]);
    });
  });

  describe("rank stays the raw stored `order` value, not a dense rank recomputed over eligible courses", () => {
    it("does not flag the top ELIGIBLE course when its raw order sits above topBandSize", () => {
      // spec.md's Decisions rule 3: topBandSize is computed over the
      // eligible count, but `order` itself is never re-normalized. Orders
      // 1-3 are done/skipping here, so only orders 4-6 are eligible
      // (topBandSize = max(1, ceil(3/3)) = 1) — but order 4's raw value is
      // still 4, which is > 1, so it is NOT flagged even though it's the
      // top-ranked course among the eligible set. Documented, intentional
      // behavior, not re-validated or "fixed" here.
      const courses = [
        course({ id: "cur_1", order: 1, learningStatus: "done", lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_2", order: 2, learningStatus: "done", lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_3", order: 3, learningStatus: "skipping", lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_4", order: 4, lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_5", order: 5, lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_6", order: 6, lastStudiedAt: daysBefore(20) }),
      ];

      const candidates = computeCourseRefocusCandidatesForSubject(
        courses,
        NOW,
        daysBefore(1),
      );

      expect(candidates).toEqual([]);
    });
  });

  describe("SCENARIO 13 — a subject where every course is done or skipping produces no banner", () => {
    it("returns an empty array without throwing when topBandSize is computed over zero eligible courses", () => {
      const courses = [
        course({ id: "cur_1", order: 1, learningStatus: "done", lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_2", order: 2, learningStatus: "skipping", lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_3", order: 3, learningStatus: "done", lastStudiedAt: daysBefore(20) }),
        course({ id: "cur_4", order: 4, learningStatus: "skipping", lastStudiedAt: daysBefore(20) }),
      ];

      expect(
        computeCourseRefocusCandidatesForSubject(courses, NOW, daysBefore(1)),
      ).toEqual([]);
    });
  });
});

describe("isRefocusSuppressedByDismissal", () => {
  it("is not suppressed when there is no dismissal", () => {
    expect(isRefocusSuppressedByDismissal(null, NOW)).toBe(false);
  });

  it("is suppressed at day 4 post-dismissal", () => {
    expect(isRefocusSuppressedByDismissal(daysBefore(4), NOW)).toBe(true);
  });

  it("is still suppressed exactly at the 7-day cooldown boundary", () => {
    expect(isRefocusSuppressedByDismissal(daysBefore(7), NOW)).toBe(true);
  });

  it("is no longer suppressed at day 8, past the cooldown", () => {
    expect(isRefocusSuppressedByDismissal(daysBefore(8), NOW)).toBe(false);
  });
});
