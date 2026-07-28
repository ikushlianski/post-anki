// Pure aggregator (issue #57, spec.md's Derivers table + Decision 7): a
// normalized gap label recurring across 3+ subjects, MASTERY-TRACKED gaps
// only (a gap_mastery row at practicing/struggling), surfaces as a one-time
// nudge — never a persistent queue. Scoped after a second adversarial pass
// tightened this away from counting any plain Socratic-discovered `open` gap
// (no gap_mastery row), which the task's directive explicitly excluded.
import type { MasteryStatus } from "../mastery/mastery-state.js";

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

const CROSS_CUTTING_SUBJECT_THRESHOLD = 3;

export interface CrossCuttingGapCandidate {
  label: string;
  subjectId: string;
  subjectName?: string;
  hasMasteryTracking: boolean;
  trackedStatus: MasteryStatus | null;
}

export interface CrossCuttingGapResult {
  label: string;
  subjectIds: string[];
  subjectNames: string[];
}

export function detectCrossCuttingGaps(
  gaps: CrossCuttingGapCandidate[],
): CrossCuttingGapResult[] {
  const subjectsByNormalizedLabel = new Map<string, Map<string, string>>();
  const displayLabelByNormalizedLabel = new Map<string, string>();

  for (const gap of gaps) {
    if (!gap.hasMasteryTracking) {
      continue;
    }

    if (gap.trackedStatus !== "practicing" && gap.trackedStatus !== "struggling") {
      continue;
    }

    const normalized = normalizeLabel(gap.label);

    if (!subjectsByNormalizedLabel.has(normalized)) {
      subjectsByNormalizedLabel.set(normalized, new Map());
      displayLabelByNormalizedLabel.set(normalized, gap.label);
    }

    subjectsByNormalizedLabel.get(normalized)!.set(gap.subjectId, gap.subjectName ?? gap.subjectId);
  }

  const results: CrossCuttingGapResult[] = [];

  for (const [normalized, subjectsById] of subjectsByNormalizedLabel) {
    if (subjectsById.size >= CROSS_CUTTING_SUBJECT_THRESHOLD) {
      results.push({
        label: displayLabelByNormalizedLabel.get(normalized)!,
        subjectIds: Array.from(subjectsById.keys()),
        subjectNames: Array.from(subjectsById.values()),
      });
    }
  }

  return results;
}
