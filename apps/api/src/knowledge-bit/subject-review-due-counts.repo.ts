import { eq, sql } from "drizzle-orm";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import type { SubjectReviewDueCounts } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { readNewRemainingToday } from "./knowledge-bit-review-queue-counts.repo.js";
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
// new-card allowance per subject, which is the same cap the queue applies globally.
export async function getSubjectReviewDueCounts(
  clock: { tz: string; now: Date },
  db: DbExecutor = getDb(),
): Promise<SubjectReviewDueCounts> {
  const { now } = clock;
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const picked = pickedVariants(undefined, now, db);
  const subjectOfBit = sql<string | null>`case when ${knowledgeBits.topicId} is null then ${knowledgeSources.subjectId} else ${curricula.subjectId} end`;

  const [bitRows, subjectRows, { remaining }] = await Promise.all([
    db
      .select({
        subjectId: subjectOfBit,
        dueCount: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql})`.mapWith(Number),
        newCount: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      })
      .from(picked)
      .innerJoin(knowledgeBits, eq(knowledgeBits.id, picked.knowledgeBitId))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .where(eq(picked.pickRank, 1))
      .groupBy(subjectOfBit),
    db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
    readNewRemainingToday(clock, db),
  ]);

  const knownSubjectIds = new Set(subjectRows.map((subject) => subject.id));
  const directBySubject = new Map<string, SubjectCountBucket>();
  const unsorted: SubjectCountBucket = { dueCount: 0, newCount: 0 };

  for (const row of bitRows) {
    const subjectId = row.subjectId;

    if (subjectId === null || !knownSubjectIds.has(subjectId)) {
      unsorted.dueCount += row.dueCount;
      unsorted.newCount += row.newCount;
      continue;
    }

    directBySubject.set(subjectId, {
      dueCount: row.dueCount,
      newCount: row.newCount,
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
      newCount: Math.min(total.newCount, remaining),
    };
  });

  return {
    subjects: subjectCounts,
    unsorted: { dueCount: unsorted.dueCount, newCount: Math.min(unsorted.newCount, remaining) },
    newRemainingToday: remaining,
  };
}
