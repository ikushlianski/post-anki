import type { LivenessEntityType, NudgeResponse } from "@post-anki/shared";
import { isDormant, shouldNudge } from "./nudge";

export const NUDGE_RELATED_LIMIT = 3;

export interface NudgeCandidate {
  entityType: LivenessEntityType;
  entityId: string;
  name: string;
  score: number | null;
  lastNudgeAt: string | null;
  lastNudgeResponse: NudgeResponse | null;
  groupKey: string | null;
}

export interface NudgeSelection {
  target: NudgeCandidate;
  related: NudgeCandidate[];
}

export function selectNudge(
  candidates: NudgeCandidate[],
  now: string,
): NudgeSelection | null {
  const surfacing = candidates.filter(
    (candidate) => !isDormant(candidate.lastNudgeResponse),
  );
  const due = surfacing.filter((candidate) =>
    shouldNudge(candidate.score, candidate.lastNudgeAt, now),
  );

  if (due.length === 0) {
    return null;
  }

  const ranked = [...due].sort(byUrgency);
  const target = ranked[0]!;
  const related = ranked
    .filter(
      (candidate) =>
        candidate.entityId !== target.entityId &&
        candidate.groupKey !== null &&
        candidate.groupKey === target.groupKey,
    )
    .slice(0, NUDGE_RELATED_LIMIT);

  return { target, related };
}

function byUrgency(a: NudgeCandidate, b: NudgeCandidate): number {
  const scoreDelta = (a.score ?? Number.MAX_SAFE_INTEGER) - (b.score ?? Number.MAX_SAFE_INTEGER);

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return a.name.localeCompare(b.name);
}
