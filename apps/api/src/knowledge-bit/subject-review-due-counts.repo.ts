import { eq, sql } from "drizzle-orm";
import type { SubjectReviewDueCounts } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { readDailyReviewLimit } from "./knowledge-bit-review-queue-daily-limit.repo.js";
import {
  readNewCardAllowance,
  summariseNewCardAllowance,
} from "./knowledge-bit-review-queue-counts.repo.js";
import { readReviewAllowance } from "./knowledge-bit-review-allowance.repo.js";
import { pickedVariants } from "./knowledge-bit-review-queue-picked.repo.js";
import {
  boundByGlobalRemaining,
  bucketToday,
  capBucket,
  globalReviewsRemaining,
  rollupSubtree,
  sumBuckets,
  type CappedBucket,
} from "./subject-today-rollup.js";

// Counts the review queue's own eligible cards (pickedVariants, one row per bit) per subject, so
// the dashboard numbers can never drift from what a review session would serve. A placed bit
// belongs to its curriculum's subject; an unplaced bit to its source's subject, matching
// scopeCondition. Bits with no subject, or a subject id that no longer exists, go to "unsorted".
// Each subject's count rolls up its whole subtree. New cards and review-phase cards are capped by
// today's remaining per-subject allowance, the same caps the queue applies.
export async function getSubjectReviewDueCounts(
  clock: { tz: string; now: Date },
  db: DbExecutor = getDb(),
): Promise<SubjectReviewDueCounts> {
  const { now } = clock;
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const picked = pickedVariants(undefined, now, db);
  const subjectOfBit = picked.cardSubjectId;
  const stepPhase = sql`${picked.phase} in ('learning', 'relearning')`;
  const resolver = await loadStudyOptionsResolver(db);

  const [bitRows, subjectRows, allowance, reviewAllowance, daily] = await Promise.all([
    db
      .select({
        subjectId: subjectOfBit,
        dueCount: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql})`.mapWith(Number),
        learningDue: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql} and ${stepPhase})`.mapWith(Number),
        reviewDue: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql} and not (${stepPhase}))`.mapWith(Number),
        newCount: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      })
      .from(picked)
      .where(eq(picked.pickRank, 1))
      .groupBy(subjectOfBit),
    db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
    readNewCardAllowance(clock, db, resolver),
    readReviewAllowance(clock, db, resolver),
    readDailyReviewLimit(clock, db),
  ]);

  const knownSubjectIds = new Set(subjectRows.map((subject) => subject.id));
  const directBySubject = new Map<string, CappedBucket>();
  const unsortedBuckets: CappedBucket[] = [];

  for (const row of bitRows) {
    const bucket = capBucket(
      { due: row.dueCount, learning: row.learningDue, reviewDue: row.reviewDue, fresh: row.newCount },
      {
        review: reviewAllowance.remainingFor(row.subjectId),
        fresh: allowance.remainingFor(row.subjectId),
      },
    );

    if (row.subjectId === null || !knownSubjectIds.has(row.subjectId)) {
      unsortedBuckets.push(bucket);
      continue;
    }

    directBySubject.set(row.subjectId, bucket);
  }

  const globalRemaining = globalReviewsRemaining(daily.limit, daily.reviewedToday);
  const toFields = (total: CappedBucket) => ({
    reviewTodayCount: total.review,
    learningDueCount: total.learning,
    todayCount: boundByGlobalRemaining(bucketToday(total), globalRemaining),
  });

  const subjectCounts = subjectRows.map((subject) => {
    const total = rollupSubtree(subject.id, subjectRows, directBySubject);
    const effective = resolver.resolve(subject.id).effective;

    return {
      subjectId: subject.id,
      dueCount: total.due,
      newCount: total.fresh,
      ...toFields(total),
      limits: {
        newCardsPerDay: effective.newCardsPerDay,
        maxReviewsPerDay: effective.maxReviewsPerDay,
      },
    };
  });

  const unsortedTotal = sumBuckets(unsortedBuckets);
  const { remaining } = summariseNewCardAllowance(
    allowance,
    bitRows.map((row) => ({ subjectId: row.subjectId, fresh: row.newCount })),
  );

  return {
    subjects: subjectCounts,
    unsorted: {
      dueCount: unsortedTotal.due,
      newCount: unsortedTotal.fresh,
      ...toFields(unsortedTotal),
    },
    newRemainingToday: remaining,
    reviewsRemainingToday: globalRemaining,
  };
}
