import type { CourseRefocusReason, LearningStatus } from "@post-anki/shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// cross-course-refocus-suggestion (issue #70) — one course's input signals
// for the per-subject deriver below. `lastStudiedAt` is the per-curriculum
// MAX(topics.progressLastInteractedAt) the repo layer computes; `createdAt`
// is the fallback for a course that has never been studied at all.
export interface CourseRefocusSignal {
  id: string;
  order: number;
  createdAt: string;
  lastStudiedAt: string | null;
  learningStatus: LearningStatus;
}

export interface CourseRefocusCandidate {
  curriculumId: string;
  reason: CourseRefocusReason;
  daysSinceActivity: number;
}

export interface CourseRefocusThresholds {
  staleDays: number;
  recentDays: number;
  activeWindowDays: number;
}

// spec.md's Decisions — no stronger existing convention found for "how long
// is too long to ignore a course" (isDomainPriorityReviewDue's 30-day
// threshold answers a different question — review cadence for a whole
// domain map, not per-course neglect). All three named here, not scattered
// magic numbers, and trivially reversible if real usage shows they're off.
export const DEFAULT_COURSE_REFOCUS_THRESHOLDS: CourseRefocusThresholds = {
  staleDays: 14,
  recentDays: 7,
  activeWindowDays: 3,
};

const DEFAULT_DISMISSAL_COOLDOWN_DAYS = 7;

function daysBetween(earlier: string, now: Date): number {
  return (now.getTime() - new Date(earlier).getTime()) / MS_PER_DAY;
}

// SCENARIO 1/2/3/6/8/12/13 — the pure per-subject candidate deriver.
// Explicit rules (see spec.md's Decisions for the full reasoning on each):
// 1. `done`/`skipping` courses are filtered out FIRST; `topBandSize` is
//    computed over that filtered (eligible) count, never the subject's raw
//    course count (Scenario 13).
// 2. `daysSinceActivity = daysBetween(lastStudiedAt ?? createdAt, now)` — a
//    never-studied course falls back to its creation date, so an old,
//    untouched, rank-1 course is still flagged, never silently exempted for
//    lacking a `lastStudiedAt` (Scenario 1).
// 3. Rank is read directly off the stored `order` value — no
//    re-normalization or dense-rank recomputation; ties/gaps inherited from
//    #69's own accepted tie-breaking behavior pass through unchanged.
export function computeCourseRefocusCandidatesForSubject(
  courses: CourseRefocusSignal[],
  now: Date,
  mostRecentActivityAnywhere: string | null,
  thresholds: CourseRefocusThresholds = DEFAULT_COURSE_REFOCUS_THRESHOLDS,
): CourseRefocusCandidate[] {
  const eligible = courses.filter(
    (c) => c.learningStatus !== "done" && c.learningStatus !== "skipping",
  );

  if (eligible.length === 0) {
    return [];
  }

  const learnerActiveElsewhere =
    mostRecentActivityAnywhere !== null &&
    daysBetween(mostRecentActivityAnywhere, now) <= thresholds.activeWindowDays;

  if (!learnerActiveElsewhere) {
    return [];
  }

  const topBandSize = Math.max(1, Math.ceil(eligible.length / 3));
  const candidates: CourseRefocusCandidate[] = [];

  for (const c of eligible) {
    const daysSinceActivity = daysBetween(c.lastStudiedAt ?? c.createdAt, now);

    if (c.order <= topBandSize && daysSinceActivity >= thresholds.staleDays) {
      candidates.push({
        curriculumId: c.id,
        reason: "stale_top_priority",
        daysSinceActivity: Math.floor(daysSinceActivity),
      });

      continue;
    }

    if (c.order === 1 && c.lastStudiedAt === null) {
      const daysSinceCreated = daysBetween(c.createdAt, now);

      if (daysSinceCreated <= thresholds.recentDays) {
        candidates.push({
          curriculumId: c.id,
          reason: "new_high_priority_ignored",
          daysSinceActivity: Math.floor(daysSinceCreated),
        });
      }
    }
  }

  return candidates;
}

// SCENARIO 4 — dismissal cooldown check. Inclusive at the boundary: a
// dismissal made exactly `cooldownDays` ago is still suppressed; one day
// past that, it isn't.
export function isRefocusSuppressedByDismissal(
  dismissedAt: string | null,
  now: Date,
  cooldownDays: number = DEFAULT_DISMISSAL_COOLDOWN_DAYS,
): boolean {
  if (dismissedAt === null) {
    return false;
  }

  return daysBetween(dismissedAt, now) <= cooldownDays;
}
