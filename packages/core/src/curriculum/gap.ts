import type {
  DepthLevel,
  Gap,
  GapVerdict,
  TopicProgress,
} from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";
import { effectiveTriageState, isAutoDeferredPushEligible } from "../gap-triage/auto-defer";
import { deriveTopicStatus } from "./progress";

const CALIBRATION_STALE_AFTER_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// Read-time-only staleness signal (#26/#42's minimal calibration reset): a gap
// whose classification hasn't been re-evaluated in 60+ days should be probed
// at a softer depth next time, without ever mutating `gap.depth` itself —
// mutating it would also change which gaps `inScopeGaps` treats as in scope.
export function isCalibrationStale(lastEvaluatedAt: string | null, now: string): boolean {
  if (!lastEvaluatedAt) {
    return false;
  }

  return new Date(now).getTime() - new Date(lastEvaluatedAt).getTime() >
    CALIBRATION_STALE_AFTER_DAYS * DAY_MS;
}

export function inScopeGaps(gaps: Gap[], depth: DepthLevel): Gap[] {
  const ceiling = DEPTH_RANK[depth];

  return gaps.filter(
    (g) => g.state !== "skipped" && DEPTH_RANK[g.depth] <= ceiling,
  );
}

export function applyGapVerdicts(
  gaps: Gap[],
  verdicts: GapVerdict[],
  now: string,
): Gap[] {
  const coveredById = new Map(verdicts.map((v) => [v.gapId, v.covered]));

  return gaps.map((gap) => {
    if (!coveredById.has(gap.id) || gap.state === "skipped") {
      return gap;
    }

    return {
      ...gap,
      state: coveredById.get(gap.id) ? "covered" : "open",
      lastEvaluatedAt: now,
    };
  });
}

export function gapMaturity(gaps: Gap[], depth: DepthLevel): number {
  const scoped = inScopeGaps(gaps, depth);

  if (scoped.length === 0) {
    return 0;
  }

  const covered = scoped.filter((g) => g.state === "covered").length;

  return Math.round((covered / scoped.length) * 100);
}

export function progressFromGaps(
  gaps: Gap[],
  depth: DepthLevel,
  attempts: number,
  now: string,
): TopicProgress {
  const maturity = gapMaturity(gaps, depth);

  return {
    status: deriveTopicStatus(maturity, attempts),
    maturity,
    attempts,
    lastInteractedAt: gaps.some((g) => g.lastEvaluatedAt) ? now : null,
  };
}

export function openGaps(gaps: Gap[], depth: DepthLevel): Gap[] {
  return inScopeGaps(gaps, depth).filter((g) => g.state === "open");
}

const DISMISSED_CHECKIN_AFTER_MONTHS = 6;

// Push-eligibility exclusion (issue #29) — a pure, read-time predicate,
// deliberately NOT folded into `openGaps`/`inScopeGaps`: those two also feed
// probe/Socratic session generation and stats reporting (probe.service.ts,
// probe-session.service.ts, stats.repo.ts), none of which #29's acceptance
// criteria ask to change. Only `selectDailyPush` (daily-push.ts) consumes
// this — correctness cannot depend on the once-a-day gapResurfaceJob having
// already run: a deferral that expired minutes ago must be excluded (still
// live) or included (once past deferredUntil) correctly on every read.
export function isPushExcluded(gap: Gap, now: string): boolean {
  if (gap.triageState === "dismissed") {
    return true;
  }

  // Issue #33 — an untriaged gap past its 3-day line is excluded from the
  // push except on its own rotation-eligible day, read-time-derived (via
  // effectiveTriageState) so this never depends on whether the 06:00 sweep
  // has already materialised the state.
  if (effectiveTriageState(gap, now) === "auto_deferred") {
    return !isAutoDeferredPushEligible(gap, now);
  }

  if (gap.triageState === "user_deferred" && gap.deferredUntil) {
    return new Date(now).getTime() < new Date(gap.deferredUntil).getTime();
  }

  return false;
}

// `deferredUntil` is already the absolute due timestamp (computed once, at
// defer-time, by applyTriageAction) — this is a plain "is it past yet"
// check, not a second place that recomputes the 60-day window.
export function isResurfaceDue(deferredUntil: string | null, now: string): boolean {
  if (!deferredUntil) {
    return false;
  }

  return new Date(now).getTime() >= new Date(deferredUntil).getTime();
}

// The `dismissedCheckinSentAt !== null` short-circuit is what makes the
// 6-month check-in a one-time event: once sent, this never matches the same
// gap again unless the user later re-dismisses it (which resets the field,
// gap-triage.ts's applyTriageAction).
export function isDismissedCheckinDue(
  dismissedAt: string | null,
  dismissedCheckinSentAt: string | null,
  now: string,
): boolean {
  if (!dismissedAt || dismissedCheckinSentAt) {
    return false;
  }

  const due = new Date(dismissedAt);

  due.setUTCMonth(due.getUTCMonth() + DISMISSED_CHECKIN_AFTER_MONTHS);

  return new Date(now).getTime() >= due.getTime();
}

export function nextGapToProbe(gaps: Gap[], depth: DepthLevel): Gap | null {
  const open = openGaps(gaps, depth);

  if (open.length === 0) {
    return null;
  }

  const ranked = [...open].sort((a, b) => {
    if (a.wanted !== b.wanted) {
      return a.wanted ? -1 : 1;
    }

    return DEPTH_RANK[a.depth] - DEPTH_RANK[b.depth];
  });

  return ranked[0]!;
}
