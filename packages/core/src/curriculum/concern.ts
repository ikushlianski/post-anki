import type { Concern, ConcernSummary, Gap } from "@post-anki/shared";
import { CONCERNS } from "@post-anki/shared";

export function summarizeConcerns(gaps: Gap[]): ConcernSummary[] {
  const byConcern = new Map<Concern, { open: number; covered: number; total: number }>();

  for (const concern of CONCERNS) {
    byConcern.set(concern, { open: 0, covered: 0, total: 0 });
  }

  for (const gap of gaps) {
    if (gap.concern === null || gap.state === "skipped") {
      continue;
    }

    const bucket = byConcern.get(gap.concern)!;
    bucket.total += 1;

    if (gap.state === "open") {
      bucket.open += 1;
    } else if (gap.state === "covered") {
      bucket.covered += 1;
    }
  }

  return CONCERNS.map((concern) => ({
    concern,
    ...byConcern.get(concern)!,
  })).filter((s) => s.total > 0);
}
