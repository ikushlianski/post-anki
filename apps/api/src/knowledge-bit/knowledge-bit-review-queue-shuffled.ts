import { weightedShuffle } from "./knowledge-bit-review-queue-mix.js";

export interface ShuffleRow {
  variantId: string;
  cardSubjectId: string | null;
  createdAt: Date;
  notYetDue?: number;
}

export function pickShuffledVariantIds(
  rows: ShuffleRow[],
  seed: string,
  reference: Date,
  limit: number,
  remainingFor: (subjectId: string | null) => number,
): string[] {
  const shuffled = weightedShuffle(rows, seed, reference).sort(
    (a, b) => (a.notYetDue ?? 0) - (b.notYetDue ?? 0),
  );
  const taken = new Map<string | null, number>();
  const ids: string[] = [];

  for (const row of shuffled) {
    const used = taken.get(row.cardSubjectId) ?? 0;

    if (ids.length >= limit) {
      break;
    }

    if (used < Math.min(limit, remainingFor(row.cardSubjectId))) {
      taken.set(row.cardSubjectId, used + 1);
      ids.push(row.variantId);
    }
  }

  return ids;
}

export function inIdOrder<T extends { variantId: string }>(rows: T[], ids: string[]): T[] {
  const position = new Map(ids.map((id, index) => [id, index]));

  return [...rows].sort((a, b) => position.get(a.variantId)! - position.get(b.variantId)!);
}
