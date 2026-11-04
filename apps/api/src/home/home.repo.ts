import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { MASTERY_THRESHOLD } from "@post-anki/core";
import type { TopSubject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, probeSessionQuestions, subjects, topics } from "../db/schema.js";

const RECENT_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function listTopSubjectsByActivity(limit = 5): Promise<TopSubject[]> {
  const db = getDb();
  const windowStart = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MS);
  const lastInteractedAt = sql<Date>`max(${topics.progressLastInteractedAt})`;

  const rows = await db
    .select({
      subjectId: curricula.subjectId,
      subjectName: subjects.name,
      lastInteractedAt,
      topicsTouchedLast30Days:
        sql<number>`count(*) filter (where ${topics.progressLastInteractedAt} >= ${windowStart})`.mapWith(
          Number,
        ),
    })
    .from(topics)
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
    .where(isNotNull(topics.progressLastInteractedAt))
    .groupBy(curricula.subjectId, subjects.name)
    .orderBy(desc(lastInteractedAt))
    .limit(limit);

  return rows.map((row) => ({
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    lastInteractedAt: new Date(row.lastInteractedAt).toISOString(),
    topicsTouchedLast30Days: row.topicsTouchedLast30Days,
  }));
}

export async function countTopicsMastered(): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(topics)
    .where(and(eq(topics.included, true), gte(topics.progressMaturity, MASTERY_THRESHOLD)));

  return rows[0]?.value ?? 0;
}

export async function countQuestionsAnswered(): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(probeSessionQuestions)
    .where(isNotNull(probeSessionQuestions.answeredAt));

  return rows[0]?.value ?? 0;
}
