import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, topics, curricula, subjects } from "../db/schema.js";

export interface KnowledgeBitForPlacementScan {
  id: string;
  body: string;
}

export async function listKnowledgeBitsForPlacementScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForPlacementScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
    })
    .from(knowledgeBits)
    .where(and(isNull(knowledgeBits.placementCheckedAt), isNull(knowledgeBits.placementFailedAt)))
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

export interface TopicForPlacement {
  topicId: string;
  topicTitle: string;
  curriculumName: string;
  subjectName: string;
}

export async function listTopicsForPlacement(
  db: DbExecutor = getDb(),
): Promise<TopicForPlacement[]> {
  return db
    .select({
      topicId: topics.id,
      topicTitle: topics.title,
      curriculumName: curricula.name,
      subjectName: subjects.name,
    })
    .from(topics)
    .innerJoin(curricula, eq(curricula.id, topics.curriculumId))
    .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
    .where(and(eq(topics.included, true), isNull(curricula.containerAreaNodeId)));
}

export async function markKnowledgeBitMatched(
  id: string,
  topicId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ topicId, placementCheckedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

export async function markKnowledgeBitSuggested(
  id: string,
  suggestion: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ placementSuggestion: suggestion, placementCheckedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

export async function markKnowledgeBitPlacementFailed(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ placementFailedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}
