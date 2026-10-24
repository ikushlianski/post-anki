import type { KnowledgeBitOverviewState } from "@post-anki/shared";

interface ScheduleStateInput {
  phase: string;
  suspendedAt: Date | null;
  buriedUntil: Date | null;
}

const PHASES: readonly KnowledgeBitOverviewState[] = ["new", "learning", "review", "relearning"];

export function deriveOverviewState(
  schedule: ScheduleStateInput | null,
  now: Date,
): KnowledgeBitOverviewState {
  if (!schedule) {
    return "new";
  }

  if (schedule.suspendedAt) {
    return "suspended";
  }

  if (schedule.buriedUntil && schedule.buriedUntil > now) {
    return "buried";
  }

  return PHASES.find((phase) => phase === schedule.phase) ?? "review";
}
