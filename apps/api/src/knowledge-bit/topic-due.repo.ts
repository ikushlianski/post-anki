import { and, eq, exists, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { gaps, knowledgeBitQuestionVariants, knowledgeBits, knowledgeBitSchedules, topics } from "../db/schema.js";

// A bit counts as due if it has never been reviewed yet (no schedule row) or its due date has
// passed — same "unreviewed counts as due" convention Anki uses, so a topic made only of fresh
// bits still shows up as needing attention rather than looking falsely caught-up. It must also
// have at least one generated question variant: that's the only thing the practice queue can
// ever actually serve, so a bit stuck in generation (pending, or permanently failed) would
// otherwise inflate a topic's due count with nothing a learner can act on.
function dueCondition(db: DbExecutor) {
  const hasQuestionVariant = exists(
    db
      .select({ one: sql`1` })
      .from(knowledgeBitQuestionVariants)
      .where(eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id)),
  );

  return and(
    hasQuestionVariant,
    or(isNull(knowledgeBitSchedules.knowledgeBitId), lte(knowledgeBitSchedules.dueAt, new Date())),
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

  return db
    .select({ topicId: topics.id, title: topics.title, dueCount, openGapCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(dueCondition(db))
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

  const rows = await db
    .select({ topicId: topics.id, dueCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(and(inArray(topics.id, topicIds), dueCondition(db)))
    .groupBy(topics.id);

  return new Map(rows.map((row) => [row.topicId, row.dueCount]));
}

// Module-level rollup, scoped to included topics only — the same exclusion
// moduleProgress/curriculumProgress apply next to this count on the badge.
export async function getDueCountsForModules(
  moduleIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  if (moduleIds.length === 0) {
    return new Map();
  }

  const dueCount = sql<number>`count(${knowledgeBits.id})::int`;

  const rows = await db
    .select({ moduleId: topics.moduleId, dueCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(
      and(inArray(topics.moduleId, moduleIds), eq(topics.included, true), dueCondition(db)),
    )
    .groupBy(topics.moduleId);

  return new Map(rows.map((row) => [row.moduleId, row.dueCount]));
}
