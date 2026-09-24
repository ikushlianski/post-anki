import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, topics, curricula, subjects } from "../db/schema.js";
import { createTopic } from "../topic/topic.repo.js";

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

export interface PendingPlacementSuggestion {
  id: string;
  body: string;
  placementSuggestion: string;
}

export async function listPendingPlacementSuggestions(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<PendingPlacementSuggestion[]> {
  const rows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      placementSuggestion: knowledgeBits.placementSuggestion,
    })
    .from(knowledgeBits)
    .where(
      and(
        isNotNull(knowledgeBits.placementSuggestion),
        isNull(knowledgeBits.topicId),
        isNull(knowledgeBits.placementSuggestionResolvedAt),
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, placementSuggestion: row.placementSuggestion as string }));
}

export type ResolvePlacementSuggestionResult =
  | { outcome: "rejected" }
  | { outcome: "accepted"; topicId: string }
  | { error: "not_found" | "already_resolved" | "module_not_found" | "invalid_input" };

// Claim-then-act, same shape as resolveDomainTopicSuggestion: the conditional UPDATE below is
// the only thing that can ever claim a given bit, so a concurrent second call always loses and
// gets already_resolved instead of double-creating a topic.
export async function resolvePlacementSuggestion(
  id: string,
  decision: "accepted" | "rejected",
  moduleId?: string,
  title?: string,
  db: DbExecutor = getDb(),
): Promise<ResolvePlacementSuggestionResult> {
  if (decision === "accepted" && (!moduleId || !title)) {
    return { error: "invalid_input" };
  }

  const claimed = (
    await db
      .update(knowledgeBits)
      .set({ placementSuggestionResolvedAt: new Date() })
      .where(
        and(
          eq(knowledgeBits.id, id),
          isNotNull(knowledgeBits.placementSuggestion),
          isNull(knowledgeBits.topicId),
          isNull(knowledgeBits.placementSuggestionResolvedAt),
        ),
      )
      .returning()
  )[0];

  if (!claimed) {
    const existing = (
      await db.select().from(knowledgeBits).where(eq(knowledgeBits.id, id))
    )[0];

    return { error: existing ? "already_resolved" : "not_found" };
  }

  if (decision === "rejected") {
    return { outcome: "rejected" };
  }

  const topic = await createTopic({ moduleId: moduleId as string, title: title as string });

  if (!topic) {
    await db
      .update(knowledgeBits)
      .set({ placementSuggestionResolvedAt: null })
      .where(eq(knowledgeBits.id, id));

    return { error: "module_not_found" };
  }

  await db.update(knowledgeBits).set({ topicId: topic.id }).where(eq(knowledgeBits.id, id));

  return { outcome: "accepted", topicId: topic.id };
}
