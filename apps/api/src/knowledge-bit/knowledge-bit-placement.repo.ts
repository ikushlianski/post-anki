import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { bitNotDiscarded } from "./knowledge-bit-approval.repo.js";
import type { PendingPlacementSuggestion } from "@post-anki/shared";
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
    .where(
      and(
        isNull(knowledgeBits.placementCheckedAt),
        isNull(knowledgeBits.placementFailedAt),
        bitNotDiscarded,
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

export interface TopicForPlacement {
  topicId: string;
  topicTitle: string;
  curriculumName: string;
  subjectName: string;
}

// Personal-app scale cap on the topic hierarchy fed into the placement prompt — see
// SEARCH_NAME_MATCH_LIMIT in search.repo.ts for the same shape.
export const TOPIC_HIERARCHY_PROMPT_LIMIT = 500;

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
    .where(
      and(
        eq(topics.included, true),
        isNull(curricula.containerAreaNodeId),
      ),
    )
    .orderBy(topics.id)
    .limit(TOPIC_HIERARCHY_PROMPT_LIMIT);
}

// No-ops if the body or approval state changed since the scan read it.
export async function markKnowledgeBitMatched(
  id: string,
  topicId: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ topicId, placementCheckedAt: new Date() })
    .where(
      and(
        eq(knowledgeBits.id, id),
        eq(knowledgeBits.body, expectedBody),
        bitNotDiscarded,
      ),
    );
}

export async function markKnowledgeBitSuggested(
  id: string,
  suggestion: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ placementSuggestion: suggestion, placementCheckedAt: new Date() })
    .where(
      and(
        eq(knowledgeBits.id, id),
        eq(knowledgeBits.body, expectedBody),
        bitNotDiscarded,
      ),
    );
}

export async function markKnowledgeBitPlacementFailed(
  id: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ placementFailedAt: new Date() })
    .where(and(eq(knowledgeBits.id, id), eq(knowledgeBits.body, expectedBody)));
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
        isNull(knowledgeBits.placementFailedAt),
        // A suggestion generated before the bit was rejected on the knowledge-item review
        // screen must not keep surfacing here — rejection is the human's own final call.
        bitNotDiscarded,
      ),
    )
    .orderBy(desc(knowledgeBits.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, placementSuggestion: row.placementSuggestion as string }));
}

export type ResolvePlacementSuggestionResult =
  | { outcome: "rejected" }
  | { outcome: "accepted"; topicId: string }
  | { error: "not_found" | "already_resolved" | "module_not_found" | "invalid_input" };

class ModuleNotFoundInTransaction extends Error {}
class BitRejectedInTransaction extends Error {}

// Claim-then-act (mirrors resolveDomainTopicSuggestion); the claim, topic insert, and
// topicId write-back share one db.transaction so a failure anywhere rolls the claim back too.
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

  try {
    return await db.transaction(async (tx) => {
      const claimed = (
        await tx
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
          await tx.select().from(knowledgeBits).where(eq(knowledgeBits.id, id))
        )[0];

        return { error: existing ? ("already_resolved" as const) : ("not_found" as const) };
      }

      if (decision === "rejected") {
        return { outcome: "rejected" as const };
      }

      // A reviewer who already rejected this bit shouldn't have a stale admin-tab click
      // create a topic for it — and the claim above must roll back too, same as module_not_found.
      if (claimed.approvalState === "rejected" || claimed.approvalState === "superseded") {
        throw new BitRejectedInTransaction();
      }

      const topic = await createTopic(
        { moduleId: moduleId as string, title: title as string },
        tx,
      );

      if (!topic) {
        // Throwing is what actually rolls the claim UPDATE back — drizzle only rolls back a
        // transaction on a thrown error, never on a normal return value.
        throw new ModuleNotFoundInTransaction();
      }

      await tx.update(knowledgeBits).set({ topicId: topic.id }).where(eq(knowledgeBits.id, id));

      return { outcome: "accepted" as const, topicId: topic.id };
    });
  } catch (err) {
    if (err instanceof ModuleNotFoundInTransaction) {
      return { error: "module_not_found" };
    }

    if (err instanceof BitRejectedInTransaction) {
      return { error: "already_resolved" };
    }

    throw err;
  }
}
