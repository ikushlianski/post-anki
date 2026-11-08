import { collectSubjectSubtreeIds, type SubjectHierarchyRow } from "@post-anki/core";

export interface SubjectDayBucket {
  due: number;
  learning: number;
  reviewDue: number;
  fresh: number;
}

export interface CappedBucket {
  due: number;
  learning: number;
  review: number;
  fresh: number;
}

export const EMPTY_CAPPED_BUCKET: CappedBucket = { due: 0, learning: 0, review: 0, fresh: 0 };

export function reviewRemaining(cap: number, used: number): number {
  return cap > 0 ? Math.max(0, cap - used) : Number.POSITIVE_INFINITY;
}

export function capBucket(
  bucket: SubjectDayBucket,
  remaining: { review: number; fresh: number },
): CappedBucket {
  return {
    due: bucket.due,
    learning: bucket.learning,
    review: Math.min(bucket.reviewDue, remaining.review),
    fresh: Math.min(bucket.fresh, remaining.fresh),
  };
}

export function bucketToday(bucket: CappedBucket): number {
  return bucket.learning + bucket.review + bucket.fresh;
}

export function sumBuckets(buckets: CappedBucket[]): CappedBucket {
  return buckets.reduce<CappedBucket>(
    (sum, bucket) => ({
      due: sum.due + bucket.due,
      learning: sum.learning + bucket.learning,
      review: sum.review + bucket.review,
      fresh: sum.fresh + bucket.fresh,
    }),
    EMPTY_CAPPED_BUCKET,
  );
}

export function rollupSubtree(
  subjectId: string,
  subjectRows: SubjectHierarchyRow[],
  bucketsBySubject: Map<string, CappedBucket>,
): CappedBucket {
  return sumBuckets(
    collectSubjectSubtreeIds(subjectId, subjectRows).flatMap((id) => {
      const bucket = bucketsBySubject.get(id);

      return bucket ? [bucket] : [];
    }),
  );
}

export function boundByGlobalRemaining(count: number, globalRemaining: number | null): number {
  return globalRemaining === null ? count : Math.min(count, globalRemaining);
}

export function globalReviewsRemaining(limit: number, reviewedToday: number): number | null {
  return limit > 0 ? Math.max(0, limit - reviewedToday) : null;
}

export interface ReviewCapSummary {
  reviewAvailable: number;
  capHidesReviews: boolean;
}

export function summariseReviewCap(
  dueBySubject: { subjectId: string | null; due: number }[],
  remainingFor: (subjectId: string | null) => number,
): ReviewCapSummary {
  const inPlay = dueBySubject.filter((entry) => entry.due > 0);

  return {
    reviewAvailable: inPlay.reduce((sum, entry) => sum + Math.min(entry.due, remainingFor(entry.subjectId)), 0),
    capHidesReviews: inPlay.some((entry) => remainingFor(entry.subjectId) === 0),
  };
}

export function applyReviewCapToQueue(
  derived: { counts: { review: number }; nextDue: Date | null },
  summary: ReviewCapSummary,
  dayEndsAt: Date,
): { review: number; nextDue: Date | null } {
  const nextDue =
    summary.capHidesReviews && (!derived.nextDue || dayEndsAt < derived.nextDue)
      ? dayEndsAt
      : derived.nextDue;

  return { review: summary.reviewAvailable, nextDue };
}
