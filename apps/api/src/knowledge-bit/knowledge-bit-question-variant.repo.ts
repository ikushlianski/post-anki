import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { getDb, type Db, type DbExecutor } from "../db/client.js";
import {
  knowledgeBits,
  knowledgeBitQuestionVariants,
  knowledgeBitSchedules,
  knowledgeBitVariantAttempts,
  tagAssignments,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface KnowledgeBitForQuestionGenerationScan {
  id: string;
  body: string;
}

export async function listKnowledgeBitsForQuestionGenerationScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForQuestionGenerationScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
    })
    .from(knowledgeBits)
    .where(
      and(
        isNull(knowledgeBits.whQuestionGeneratedAt),
        isNull(knowledgeBits.whQuestionGenerationFailedAt),
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
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

export async function markWhQuestionGenerated(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ whQuestionGeneratedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
}

// Insert + mark share one db.transaction so a mark-write failure after a successful insert can
// never leave a variant row orphaned on a bit the next scan would otherwise re-pick-up — the
// unique index on (knowledge_bit_id, kind, order) also guards a second, concurrent scan.
export async function recordGeneratedQuestionVariant(
  knowledgeBitId: string,
  kind: KnowledgeBitQuestionVariantKind,
  order: number,
  prompt: string,
  answer: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertQuestionVariant(knowledgeBitId, kind, order, prompt, answer, tx);
    await markWhQuestionGenerated(knowledgeBitId, tx);
  });
}

export async function markWhQuestionGenerationFailed(
  id: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ whQuestionGenerationFailedAt: new Date() })
    .where(eq(knowledgeBits.id, id));
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
}

export interface NextQuestionVariantsFilter {
  tagId?: string;
  // Scopes the queue to one topic's bits — what "tap a pressing topic, resume studying it" on
  // the home screen resolves to. Mutually exclusive with tagId in practice (the caller picks one).
  topicId?: string;
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
    );

  const condition = filter?.topicId
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

  const filtered = condition ? base.where(condition) : base;

  const rows = await filtered
    .groupBy(
      knowledgeBitQuestionVariants.id,
      knowledgeBitQuestionVariants.kind,
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.body,
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
