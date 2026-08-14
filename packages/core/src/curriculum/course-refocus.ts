export const STALE_DAYS = 14;
export const RECENT_DAYS = 7;
export const ACTIVE_WINDOW_DAYS = 3;

interface CourseRefocusSignal {
  id: string;
  order: number;
  learningStatus: string;
  createdAt: Date;
  lastStudiedAt: Date | null;
}

export interface CourseRefocusCandidate {
  curriculumId: string;
  reason: "stale_top_priority" | "new_high_priority_ignored";
}

interface CourseRefocusThresholds {
  staleDays: number;
  recentDays: number;
  activeWindowDays: number;
}

function daysSince(date: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((now.getTime() - date.getTime()) / msPerDay);
}

function computeTopBandSize(eligibleCount: number): number {
  return Math.max(1, Math.ceil(eligibleCount / 3));
}

export function hasSustainedEngagementElsewhere(
  activityAnywhere: Date[],
  now: Date,
  thresholds: CourseRefocusThresholds,
): boolean {
  let isActiveNow = false;
  let wasAlreadyEngagedBeforeNow = false;

  for (const activity of activityAnywhere) {
    const days = daysSince(activity, now);

    if (days <= thresholds.activeWindowDays) {
      isActiveNow = true;
      continue;
    }

    if (days < thresholds.staleDays) {
      wasAlreadyEngagedBeforeNow = true;
    }
  }

  return isActiveNow && wasAlreadyEngagedBeforeNow;
}

export function computeCourseRefocusCandidatesForSubject(
  courses: CourseRefocusSignal[],
  now: Date,
  activityAnywhere: Date[],
  thresholds: CourseRefocusThresholds,
): CourseRefocusCandidate[] {
  const eligible = courses.filter((c) => c.learningStatus !== "done" && c.learningStatus !== "skipped");

  if (eligible.length === 0) {
    return [];
  }

  const isEngagedElsewhere = hasSustainedEngagementElsewhere(activityAnywhere, now, thresholds);

  if (!isEngagedElsewhere) {
    return [];
  }

  const topBandSize = computeTopBandSize(eligible.length);
  const candidates: CourseRefocusCandidate[] = [];

  for (const course of eligible) {
    const referenceDate = course.lastStudiedAt ?? course.createdAt;
    const daysSinceActivity = daysSince(referenceDate, now);

    if (course.order <= topBandSize && daysSinceActivity >= thresholds.staleDays) {
      candidates.push({
        curriculumId: course.id,
        reason: "stale_top_priority",
      });
    }

    if (
      course.order === 1 &&
      course.lastStudiedAt === null &&
      daysSince(course.createdAt, now) <= thresholds.recentDays
    ) {
      candidates.push({
        curriculumId: course.id,
        reason: "new_high_priority_ignored",
      });
    }
  }

  return candidates;
}

export function isRefocusSuppressedByDismissal(
  dismissedAt: Date | null,
  now: Date,
  cooldownDays: number,
): boolean {
  if (dismissedAt === null) {
    return false;
  }

  const daysSinceDismissal = daysSince(dismissedAt, now);
  return daysSinceDismissal <= cooldownDays;
}
