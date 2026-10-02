import { and, asc, count, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBits,
  knowledgeBitQuestionVariants,
  knowledgeBitSchedules,
  knowledgeBitVariantAttempts,
  tagAssignments,
  topics,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface KnowledgeBitForQuestionGenerationScan {
  id: string;
  body: string;
}

export async function insertQuestionVariant(
  knowledgeBitId: string,
  kind: KnowledgeBitQuestionVariantKind,
  order: number,
  prompt: string,
  answer: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db.insert(knowledgeBitQuestionVariants).values({
    id: newId("kbqv"),
    knowledgeBitId,
    kind,
    order,
    prompt,
    answer,
  });
}

export interface QuestionVariantForEmbeddingScan {
  id: string;
  prompt: string;
  answer: string;
  embeddingHash: string | null;
}

export async function listQuestionVariantsForEmbeddingScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<QuestionVariantForEmbeddingScan[]> {
  return db
    .select({
      id: knowledgeBitQuestionVariants.id,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      embeddingHash: knowledgeBitQuestionVariants.embeddingHash,
    })
    .from(knowledgeBitQuestionVariants)
    .where(isNull(knowledgeBitQuestionVariants.embeddedAt))
    .orderBy(asc(knowledgeBitQuestionVariants.createdAt))
    .limit(limit);
}

export interface NextQuestionVariantRow {
  variantId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  knowledgeBitId: string;
  bitBody: string;
  background: string | null;
}

export interface NextQuestionVariantsFilter {
  tagId?: string;
  // Scopes the queue to one topic's bits — what "tap a pressing topic, resume studying it" on
  // the home screen resolves to. Mutually exclusive with tagId in practice (the caller picks one).
  topicId?: string;
  // Scopes the queue to a single bit — what a search result without a curriculum placement links
  // to. Takes priority over tagId/topicId if more than one is somehow present.
  knowledgeBitId?: string;
}

/**
 * Fair, cycling answer queue: variants with fewer past attempts come first, ties broken by the
 * variant's own createdAt — never-answered variants surface before over-practiced ones, and the
 * whole set cycles back around once every variant has been seen at least once. No scheduling
 * state, no due list — read-time only, per answer-screen/plan.md's explicit non-goal.
 *
 * Scoped to a single topic (the "tap a pressing topic, resume studying it" home-screen flow) is
 * the one exception: there the caller already knows this topic is due from the schedule rollup, so
 * the queue also sorts a bit's own due state first — never-reviewed-or-overdue bits ahead of
 * not-yet-due ones — before falling back to the same fair-cycling order. Otherwise a topic could
 * show "N due" while serving already-comfortable bits ahead of the ones that earned that count.
 */
export async function listNextQuestionVariantsToAnswer(
  limit: number,
  filter: NextQuestionVariantsFilter | undefined,
  db: DbExecutor = getDb(),
): Promise<NextQuestionVariantRow[]> {
  const attemptCount = count(knowledgeBitVariantAttempts.id);
  const dueRank = sql<number>`min(case when ${knowledgeBitSchedules.knowledgeBitId} is null or ${knowledgeBitSchedules.dueAt} <= now() then 0 else 1 end)`;
  const selection = {
    variantId: knowledgeBitQuestionVariants.id,
    kind: knowledgeBitQuestionVariants.kind,
    prompt: knowledgeBitQuestionVariants.prompt,
    knowledgeBitId: knowledgeBits.id,
    bitBody: knowledgeBits.body,
    background: knowledgeBits.background,
  };

  const base = db
    .select(selection)
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(
      knowledgeBitVariantAttempts,
      eq(knowledgeBitVariantAttempts.variantId, knowledgeBitQuestionVariants.id),
    )
    .leftJoin(
      knowledgeBitSchedules,
      eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id),
    )
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId));

  // A topic the learner deliberately dropped (learningStatus "skipping") must never serve
  // questions, regardless of which filter reached it — a bit with no topic placement is
  // unaffected, since topics.learningStatus is null for it.
  const topicNotDropped = or(isNull(knowledgeBits.topicId), ne(topics.learningStatus, "skipping"));

  const scopeCondition = filter?.knowledgeBitId
    ? eq(knowledgeBits.id, filter.knowledgeBitId)
    : filter?.topicId
      ? eq(knowledgeBits.topicId, filter.topicId)
      : filter?.tagId
        ? inArray(
            knowledgeBits.id,
            db
              .select({ id: tagAssignments.nodeId })
              .from(tagAssignments)
              .where(
                and(
                  eq(tagAssignments.tagId, filter.tagId),
                  eq(tagAssignments.nodeType, "knowledgeBit"),
                ),
              ),
          )
        : undefined;

  const condition = scopeCondition ? and(scopeCondition, topicNotDropped) : topicNotDropped;

  const filtered = base.where(condition);

  const rows = await filtered
    .groupBy(
      knowledgeBitQuestionVariants.id,
      knowledgeBitQuestionVariants.kind,
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.body,
      knowledgeBits.background,
    )
    .orderBy(
      ...(filter?.topicId ? [asc(dueRank)] : []),
      asc(attemptCount),
      asc(knowledgeBitQuestionVariants.createdAt),
    )
    .limit(limit);

  return rows.map((row) => ({ ...row, kind: row.kind as KnowledgeBitQuestionVariantKind }));
}

export async function updateQuestionVariantEmbedding(
  id: string,
  embedding: number[],
  embeddingHash: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBitQuestionVariants)
    .set({ embedding, embeddingHash, embeddedAt: new Date() })
    .where(eq(knowledgeBitQuestionVariants.id, id));
}
