import type { PushCandidate } from "../curriculum/daily-push";

export function scopeSessionCandidates(
  candidates: PushCandidate[],
  scopedCurriculumIds: string[] | null,
  alreadyCoveredGapIds: string[],
): PushCandidate[] {
  const scopedSet = scopedCurriculumIds ? new Set(scopedCurriculumIds) : null;
  const coveredSet = new Set(alreadyCoveredGapIds);

  return candidates
    .filter((candidate) => !scopedSet || scopedSet.has(candidate.curriculumId))
    .map((candidate) => ({
      ...candidate,
      gaps: candidate.gaps.filter((gap) => !coveredSet.has(gap.id)),
    }));
}
