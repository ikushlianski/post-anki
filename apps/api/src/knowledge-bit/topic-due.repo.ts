import { and, asc, eq, exists, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { foldTagMastery, type MasteryEntryState } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  gaps,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeBitVariantAttempts,
  topics,
} from "../db/schema.js";
import { listDormantEntityIds } from "../liveness/liveness.repo.js";
import { inReviewRotation } from "./knowledge-bit-schedule.repo.js";

// A bit counts as due if it has never been reviewed yet (no schedule row) or its due date has
// passed — same "unreviewed counts as due" convention Anki uses, so a topic made only of fresh
// bits still shows up as needing attention rather than looking falsely caught-up. It must also
// have at least one generated question variant: that's the only thing the practice queue can
// ever actually serve, so a bit stuck in generation (pending, or permanently failed) would
// otherwise inflate a topic's due count with nothing a learner can act on. It must also be
// approved — a pending/rejected bit can't be answered, so counting it due would show a badge
// the queue can never actually serve. Suspended and buried bits are skipped for the same reason.
//
// Also excludes a topic that's not yet released or deliberately dropped, and a topic whose
// curriculum is still a draft (not yet confirmed by the learner) or dormant (the learner
// dismissed a nudge for it) — same two checks gatherPushCandidates applies on the gap-based due
// path (push.repo.ts). Callers must join `topics` and `curricula`, and pass the dormant
// curriculum id set fetched via listDormantEntityIds("curriculum").
function dueCondition(db: DbExecutor, dormantCurriculumIds: Set<string>) {
  const hasQuestionVariant = exists(
    db
      .select({ one: sql`1` })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      ),
  );

  return and(
    hasQuestionVariant,
    eq(knowledgeBits.approvalState, "approved"),
    inReviewRotation(new Date()),
    or(isNull(knowledgeBitSchedules.knowledgeBitId), lte(knowledgeBitSchedules.dueAt, new Date())),
    eq(topics.included, true),
    ne(topics.learningStatus, "skipping"),
    eq(curricula.status, "confirmed"),
    dormantCurriculumIds.size > 0
      ? notInArray(topics.curriculumId, Array.from(dormantCurriculumIds))
      : undefined,
  );
}

export interface TopicDueCount {
  topicId: string;
  title: string;
  dueCount: number;
}

// The topic-level rollup of per-bit due state — a topic with no knowledge bits, or with bits but
// none due, is simply absent from the result rather than returned with dueCount: 0.
//
// Default ranking (no product input): oldest overdue bit first, unreviewed = most overdue;
// open-gap count breaks ties, computed in the same query so LIMIT never cuts it off early.
export async function listTopicsWithDueCounts(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<TopicDueCount[]> {
  // Postgres count() returns bigint, which node-postgres surfaces as a string — cast to int so
  // callers get a real number, not "2".
  const dueCount = sql<number>`count(${knowledgeBits.id})::int`;
  const openGapCount = sql<number>`(
    select count(*)::int from ${gaps} where ${gaps.topicId} = ${topics.id} and ${gaps.state} = 'open'
  )`;
  const dormantCurriculumIds = await listDormantEntityIds("curriculum", db);

  return db
    .select({ topicId: topics.id, title: topics.title, dueCount, openGapCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(dueCondition(db, dormantCurriculumIds))
    .groupBy(topics.id, topics.title)
    .orderBy(
      sql`min(coalesce(${knowledgeBitSchedules.dueAt}, '-infinity'::timestamptz)) asc`,
      sql`${openGapCount} desc`,
      sql`count(${knowledgeBits.id}) desc`,
    )
    .limit(limit)
    .then((rows) => rows.map(({ topicId, title, dueCount: count }) => ({ topicId, title, dueCount: count })));
}

// Scoped lookup for a known set of topics (e.g. a course/deck detail view), rather than the
// global top-N ranking listTopicsWithDueCounts serves.
export async function getDueCountsForTopics(
  topicIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const dueCount = sql<number>`count(${knowledgeBits.id})::int`;
  const dormantCurriculumIds = await listDormantEntityIds("curriculum", db);

  const rows = await db
    .select({ topicId: topics.id, dueCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(and(inArray(topics.id, topicIds), dueCondition(db, dormantCurriculumIds)))
    .groupBy(topics.id);

  return new Map(rows.map((row) => [row.topicId, row.dueCount]));
}

// Topic-scoped sibling of getTagMasteryLevels (tag.repo.ts), same fold, scoped by knowledgeBits.topicId.
export async function getTopicBitMasteryLevels(
  topicIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, MasteryEntryState>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      topicId: knowledgeBits.topicId,
      verdict: knowledgeBitVariantAttempts.verdict,
    })
    .from(knowledgeBits)
    .innerJoin(
      knowledgeBitQuestionVariants,
      eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
    )
    .innerJoin(
      knowledgeBitVariantAttempts,
      eq(knowledgeBitVariantAttempts.variantId, knowledgeBitQuestionVariants.id),
    )
    .where(inArray(knowledgeBits.topicId, topicIds))
    .orderBy(asc(knowledgeBitVariantAttempts.createdAt), asc(knowledgeBitVariantAttempts.id));

  const attemptsByTopic = new Map<string, { verdict: string }[]>();

  for (const row of rows) {
    if (!row.topicId) {
      continue;
    }

    const existing = attemptsByTopic.get(row.topicId);

    if (existing) {
      existing.push({ verdict: row.verdict });
    } else {
      attemptsByTopic.set(row.topicId, [{ verdict: row.verdict }]);
    }
  }

  const result = new Map<string, MasteryEntryState>();

  for (const [topicId, attempts] of attemptsByTopic) {
    result.set(topicId, foldTagMastery(attempts));
  }

  return result;
}

// Module-level rollup, shown as a badge next to moduleProgress/curriculumProgress.
export async function getDueCountsForModules(
  moduleIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  if (moduleIds.length === 0) {
    return new Map();
  }

  const dueCount = sql<number>`count(${knowledgeBits.id})::int`;
  const dormantCurriculumIds = await listDormantEntityIds("curriculum", db);

  const rows = await db
    .select({ moduleId: topics.moduleId, dueCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(and(inArray(topics.moduleId, moduleIds), dueCondition(db, dormantCurriculumIds)))
    .groupBy(topics.moduleId);

  return new Map(rows.map((row) => [row.moduleId, row.dueCount]));
}
