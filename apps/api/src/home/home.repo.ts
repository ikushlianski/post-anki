import { and, count, eq, gte, isNotNull } from "drizzle-orm";
import { MASTERY_THRESHOLD } from "@post-anki/core";
import type { TopSubject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, probeSessionQuestions, subjects, topics } from "../db/schema.js";

const RECENT_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function listTopSubjectsByActivity(limit = 5): Promise<TopSubject[]> {
  const db = getDb();

  const rows = await db
    .select({
      subjectId: curricula.subjectId,
      subjectName: subjects.name,
      lastInteractedAt: topics.progressLastInteractedAt,
    })
    .from(topics)
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
    .where(isNotNull(topics.progressLastInteractedAt));

  const now = Date.now();
  const bySubjectId = new Map<
    string,
    { subjectName: string; lastInteractedAt: Date; topicsTouchedLast30Days: number }
  >();

  for (const row of rows) {
    const lastInteractedAt = row.lastInteractedAt!;
    const withinWindow = now - lastInteractedAt.getTime() <= RECENT_ACTIVITY_WINDOW_MS ? 1 : 0;
    const existing = bySubjectId.get(row.subjectId);

    if (!existing) {
      bySubjectId.set(row.subjectId, {
        subjectName: row.subjectName,
        lastInteractedAt,
        topicsTouchedLast30Days: withinWindow,
      });
      continue;
    }

    existing.topicsTouchedLast30Days += withinWindow;

    if (lastInteractedAt.getTime() > existing.lastInteractedAt.getTime()) {
      existing.lastInteractedAt = lastInteractedAt;
    }
  }

  return [...bySubjectId.entries()]
    .map(([subjectId, value]) => ({
      subjectId,
      subjectName: value.subjectName,
      lastInteractedAt: value.lastInteractedAt.toISOString(),
      topicsTouchedLast30Days: value.topicsTouchedLast30Days,
    }))
    .sort((a, b) => b.lastInteractedAt.localeCompare(a.lastInteractedAt))
    .slice(0, limit);
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
