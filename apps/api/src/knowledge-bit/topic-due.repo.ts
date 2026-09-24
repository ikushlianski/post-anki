import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitSchedules, topics } from "../db/schema.js";

// A bit counts as due if it has never been reviewed yet (no schedule row) or its due date has
// passed — same "unreviewed counts as due" convention Anki uses, so a topic made only of fresh
// bits still shows up as needing attention rather than looking falsely caught-up.
function dueCondition() {
  return or(isNull(knowledgeBitSchedules.knowledgeBitId), lte(knowledgeBitSchedules.dueAt, new Date()));
}

export interface TopicDueCount {
  topicId: string;
  title: string;
  dueCount: number;
}

// The topic-level rollup of per-bit due state — a topic with no knowledge bits, or with bits but
// none due, is simply absent from the result rather than returned with dueCount: 0.
export async function listTopicsWithDueCounts(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<TopicDueCount[]> {
  // Postgres count() returns bigint, which node-postgres surfaces as a string — cast to int so
  // callers get a real number, not "2".
  const dueCount = sql<number>`count(${knowledgeBits.id})::int`;

  return db
    .select({ topicId: topics.id, title: topics.title, dueCount })
    .from(knowledgeBits)
    .innerJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .where(dueCondition())
    .groupBy(topics.id, topics.title)
    .orderBy(sql`count(${knowledgeBits.id}) desc`)
    .limit(limit);
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
    .where(and(inArray(topics.id, topicIds), dueCondition()))
    .groupBy(topics.id);

  return new Map(rows.map((row) => [row.topicId, row.dueCount]));
}
