import type { Gap, TriageAction } from "@post-anki/shared";

const DEFER_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TriageResult {
  gap: Gap;
  changed: boolean;
}

// The one write path for a triage tap (issue #29, plan.md "Pure logic").
// `dismiss` deliberately never blocks on the current state (the issue's
// explicit late-triage rule — dismissing an `important` or previously
// reopened gap is always allowed); `important` and `defer` each have their
// own single no-op condition (already-important; a still-live deferral),
// everything else is a real transition even when the resulting label
// matches a prior one (a resurfaced re-defer is a fresh choice).
export function applyTriageAction(gap: Gap, action: TriageAction, now: string): TriageResult {
  if (action === "important") {
    return applyImportant(gap, now);
  }

  if (action === "defer") {
    return applyDefer(gap, now);
  }

  if (action === "dismiss") {
    return applyDismiss(gap, now);
  }

  return applyRevisit(gap, now);
}

function applyImportant(gap: Gap, now: string): TriageResult {
  if (gap.triageState === "important") {
    return { gap, changed: false };
  }

  return {
    gap: {
      ...gap,
      triageState: "important",
      triagedAt: now,
      deferredUntil: null,
      dismissedAt: null,
      dismissedCheckinSentAt: null,
    },
    changed: true,
  };
}

function applyDefer(gap: Gap, now: string): TriageResult {
  const stillLiveDeferral =
    gap.triageState === "user_deferred" &&
    gap.deferredUntil !== null &&
    new Date(gap.deferredUntil).getTime() > new Date(now).getTime();

  if (stillLiveDeferral) {
    return { gap, changed: false };
  }

  const deferredUntil = new Date(new Date(now).getTime() + DEFER_DAYS * DAY_MS).toISOString();

  return {
    gap: {
      ...gap,
      triageState: "user_deferred",
      triagedAt: now,
      deferredUntil,
      deferralCount: gap.deferralCount + 1,
      dismissedAt: null,
      dismissedCheckinSentAt: null,
    },
    changed: true,
  };
}

// The dismissed check-in's "Actually, let's revisit" outcome — reopens a
// dismissed gap back to `untriaged` and clears its dismissed bookkeeping so
// a later re-dismissal starts a genuinely fresh 6-month clock.
function applyRevisit(gap: Gap, now: string): TriageResult {
  if (gap.triageState === "untriaged") {
    return { gap, changed: false };
  }

  return {
    gap: {
      ...gap,
      triageState: "untriaged",
      triagedAt: now,
      deferredUntil: null,
      dismissedAt: null,
      dismissedCheckinSentAt: null,
      // Issue #33 — every return to untriaged earns a fresh full 3-day
      // auto-defer window, never a shortened repeat-offender one.
      untriagedSince: now,
    },
    changed: true,
  };
}

function applyDismiss(gap: Gap, now: string): TriageResult {
  if (gap.triageState === "dismissed") {
    return { gap, changed: false };
  }

  return {
    gap: {
      ...gap,
      triageState: "dismissed",
      triagedAt: now,
      dismissedAt: now,
      // A fresh dismissal always restarts its own 6-month check-in clock.
      dismissedCheckinSentAt: null,
      deferredUntil: null,
    },
    changed: true,
  };
}
