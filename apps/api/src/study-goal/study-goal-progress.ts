import { collectSubjectSubtreeIds } from "@post-anki/core";
import type { PriorityProgress, PriorityTargetMetric } from "@post-anki/shared";

export interface SubjectNode {
  name: string;
  id: string;
  parentId: string | null;
}

export interface DirectActivity {
  reviews: number;
  newCards: number;
  notes: number;
}

export const EMPTY_PROGRESS: PriorityProgress = { reviews: 0, newCards: 0, notes: 0 };

export function rollUpProgress(
  subjectId: string,
  subjectRows: SubjectNode[],
  direct: Map<string, DirectActivity>,
): PriorityProgress {
  return collectSubjectSubtreeIds(subjectId, subjectRows).reduce<PriorityProgress>((sum, id) => {
    const own = direct.get(id);

    return own
      ? {
          reviews: sum.reviews + own.reviews,
          newCards: sum.newCards + own.newCards,
          notes: sum.notes + own.notes,
        }
      : sum;
  }, EMPTY_PROGRESS);
}

export function mergeActivity(
  reviews: Map<string, { reviews: number; newCards: number }>,
  notes: Map<string, number>,
): Map<string, DirectActivity> {
  const merged = new Map<string, DirectActivity>();

  for (const [id, counts] of reviews) {
    merged.set(id, { ...counts, notes: 0 });
  }

  for (const [id, count] of notes) {
    const existing = merged.get(id) ?? { reviews: 0, newCards: 0, notes: 0 };

    merged.set(id, { ...existing, notes: count });
  }

  return merged;
}

export function currentForMetric(metric: PriorityTargetMetric, progress: PriorityProgress): number | null {
  if (metric === "reviews") {
    return progress.reviews;
  }

  if (metric === "new_cards") {
    return progress.newCards;
  }

  if (metric === "notes") {
    return progress.notes;
  }

  return null;
}

export function isTargetMet(current: number | null, targetValue: number | null, doneAt: Date | null): boolean {
  if (doneAt) {
    return true;
  }

  return current !== null && targetValue !== null && current >= targetValue;
}
