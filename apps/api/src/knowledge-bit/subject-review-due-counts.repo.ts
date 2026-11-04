import { eq, sql } from "drizzle-orm";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import type { SubjectReviewDueCounts } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";
import {
  readNewCardAllowance,
  summariseNewCardAllowance,
} from "./knowledge-bit-review-queue-counts.repo.js";
import { pickedVariants } from "./knowledge-bit-review-queue-picked.repo.js";

interface SubjectCountBucket {
  dueCount: number;
  newCount: number;
}

// Counts the review queue's own eligible cards (pickedVariants, one row per bit) per subject, so
// the dashboard numbers can never drift from what a review session would serve. A placed bit
// belongs to its curriculum's subject; an unplaced bit to its source's subject, matching
// scopeCondition. Bits with no subject, or a subject id that no longer exists, go to "unsorted".
// Each subject's count rolls up its whole subtree. New cards are capped by today's remaining
// new-card allowance per subject, which is the same cap the queue applies.
export async function getSubjectReviewDueCounts(
  clock: { tz: string; now: Date },
  db: DbExecutor = getDb(),
): Promise<SubjectReviewDueCounts> {
  const { now } = clock;
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const picked = pickedVariants(undefined, now, db);
  const subjectOfBit = picked.cardSubjectId;

  const [bitRows, subjectRows, allowance] = await Promise.all([
    db
      .select({
        subjectId: subjectOfBit,
        dueCount: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql})`.mapWith(Number),
        newCount: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      })
      .from(picked)
      .where(eq(picked.pickRank, 1))
      .groupBy(subjectOfBit),
    db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
    readNewCardAllowance(clock, db),
  ]);

  const knownSubjectIds = new Set(subjectRows.map((subject) => subject.id));
  const directBySubject = new Map<string, SubjectCountBucket>();
  const unsorted: SubjectCountBucket = { dueCount: 0, newCount: 0 };

  for (const row of bitRows) {
    const subjectId = row.subjectId;
    const newCount = Math.min(row.newCount, allowance.remainingFor(subjectId));

    if (subjectId === null || !knownSubjectIds.has(subjectId)) {
      unsorted.dueCount += row.dueCount;
      unsorted.newCount += newCount;
      continue;
    }

    directBySubject.set(subjectId, {
      dueCount: row.dueCount,
      newCount,
    });
  }

  const subjectCounts = subjectRows.map((subject) => {
    const subtree = collectSubjectSubtreeIds(subject.id, subjectRows);
    const total = subtree.reduce<SubjectCountBucket>(
      (sum, id) => {
        const bucket = directBySubject.get(id);

        return bucket
          ? { dueCount: sum.dueCount + bucket.dueCount, newCount: sum.newCount + bucket.newCount }
          : sum;
      },
      { dueCount: 0, newCount: 0 },
    );

    return {
      subjectId: subject.id,
      dueCount: total.dueCount,
      newCount: total.newCount,
    };
  });

  const { remaining } = summariseNewCardAllowance(
    allowance,
    bitRows.map((row) => ({ subjectId: row.subjectId, fresh: row.newCount })),
  );

  return {
    subjects: subjectCounts,
    unsorted,
    newRemainingToday: remaining,
  };
}
