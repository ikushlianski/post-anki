import type { Gap, GapTriageState } from "@post-anki/shared";
import type { TriageResult } from "./gap-triage";

const DAY_MS = 24 * 60 * 60 * 1000;

export const AUTO_DEFER_AFTER_DAYS = 3;
export const AUTO_DEFERRED_PUSH_INTERVAL_DAYS = 3;

// The moment this gap becomes (or became) auto-deferred — derived from
// `untriagedSince` only, never read from `autoDeferredAt`, so the push
// rotation's phase (isAutoDeferredPushEligible below) is identical before
// and after the sweep has materialised the state (spec.md Decision 2,
// property 3).
export function autoDeferAnchor(gap: Gap): string {
  return new Date(
    new Date(gap.untriagedSince).getTime() + AUTO_DEFER_AFTER_DAYS * DAY_MS,
  ).toISOString();
}

// Due only for a gap whose STORED state is `untriaged` — an already
// auto-deferred/important/user_deferred/dismissed gap never re-fires this,
// regardless of how old `untriagedSince` is (AC 13).
export function isAutoDeferDue(gap: Gap, now: string): boolean {
  if (gap.triageState !== "untriaged") {
    return false;
  }

  return new Date(now).getTime() >= new Date(autoDeferAnchor(gap)).getTime();
}

// The single authority for every behavioural question (push eligibility,
// fail-reactivation) — mirrors gap.ts's isResurfaceDue/isDismissedCheckinDue
// read-time-derived pattern (#29's decision 8, carried forward here): the
// stored `triage_state` column never leads, it only follows what this
// function already believes.
export function effectiveTriageState(gap: Gap, now: string): GapTriageState {
  if (gap.triageState === "untriaged" && isAutoDeferDue(gap, now)) {
    return "auto_deferred";
  }

  return gap.triageState;
}

// `untriaged` + due -> `auto_deferred`. Stamps `autoDeferredAt`; leaves
// `triagedAt` (auto-defer is not a user decision — spec.md Decision 5),
// `untriagedSince`, `deferralCount` and `state` untouched. `changed: false`
// for every other input, including a gap that is already `auto_deferred`.
export function applyAutoDefer(gap: Gap, now: string): TriageResult {
  if (!isAutoDeferDue(gap, now)) {
    return { gap, changed: false };
  }

  return {
    gap: {
      ...gap,
      triageState: "auto_deferred",
      autoDeferredAt: now,
    },
    changed: true,
  };
}

// A fresh Fail on a gap whose EFFECTIVE state is `auto_deferred` (keyed on
// effective, not stored state, so the outcome never depends on whether the
// 06:00 sweep has already run — spec.md Decision 12) pulls it straight back
// to a full window. `changed: false` for every other effective state,
// including plain `untriaged` (the issue's own Tuesday/Wednesday/Thursday
// rule — a Fail on a gap that hasn't crossed its line yet resets nothing)
// and `user_deferred`/`important`/`dismissed` (a Fail never overrides an
// explicit user choice — spec.md Decision 10).
export function reactivateOnFail(gap: Gap, now: string): TriageResult {
  if (effectiveTriageState(gap, now) !== "auto_deferred") {
    return { gap, changed: false };
  }

  return {
    gap: {
      ...gap,
      triageState: "untriaged",
      untriagedSince: now,
      autoDeferredAt: null,
    },
    changed: true,
  };
}

// The Decision-2 rotation: an auto-deferred gap is push-eligible on its own
// anchor day and every AUTO_DEFERRED_PUSH_INTERVAL_DAYS-th day after —
// anchored per-gap (not a single global "auto-defer day") so the eligible
// population spreads across the week instead of flooding one day and
// vanishing on the other two.
export function isAutoDeferredPushEligible(gap: Gap, now: string): boolean {
  const anchorDayIndex = Math.floor(new Date(autoDeferAnchor(gap)).getTime() / DAY_MS);
  const nowDayIndex = Math.floor(new Date(now).getTime() / DAY_MS);
  const daysSinceAnchor = nowDayIndex - anchorDayIndex;

  return daysSinceAnchor >= 0 && daysSinceAnchor % AUTO_DEFERRED_PUSH_INTERVAL_DAYS === 0;
}
