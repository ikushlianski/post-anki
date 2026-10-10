import { and, asc, count, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
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
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { inReviewRotation } from "./knowledge-bit-schedule.repo.js";
import { TYPED_VARIANT_KINDS } from "./knowledge-bit-variant-kind-rules.js";

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
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .where(
      and(
        isNull(knowledgeBitQuestionVariants.embeddedAt),
        isNull(knowledgeBitQuestionVariants.supersededAt),
        ne(knowledgeBits.approvalState, "rejected"),
      ),
    )
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
 * Answer queue. Scoped to a tag, topic or single bit it is a fair, cycling queue: variants with
 * fewer past attempts come first, ties broken by the variant's own createdAt, and the set cycles
 * back around once every variant has been seen. No due filter applies there.
 *
 * Unscoped it serves only bits that are due or never scheduled (no schedule row, or due_at <= now),
 * one variant per bit: the one with the fewest attempts, then basic > fill_in_the_blank > the
 * rest, then oldest — so a bit never shows two variants that share one schedule.
 *
 * Topic scope additionally sorts a bit's own due state first — never-reviewed-or-overdue bits
 * ahead of not-yet-due ones — because the caller already knows the topic is due from the
 * schedule rollup, and it must not serve comfortable bits ahead of the ones that earned the count.
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
  // A superseded variant belongs to a since-edited body — never serve its stale prompt, even
  // though its attempt history stays joinable for mastery/scheduling elsewhere.
  const variantActive = and(
    isNull(knowledgeBitQuestionVariants.supersededAt),
    inArray(knowledgeBitQuestionVariants.kind, [...TYPED_VARIANT_KINDS]),
  );

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

  const condition = scopeCondition
    ? and(scopeCondition, topicNotDropped, variantActive, bitApproved, inReviewRotation(new Date()))
    : and(topicNotDropped, variantActive, bitApproved, inReviewRotation(new Date()));

  if (!scopeCondition) {
    return listUnscopedVariants(limit, condition, db);
  }

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

async function listUnscopedVariants(
  limit: number,
  eligible: SQL | undefined,
  db: DbExecutor,
): Promise<NextQuestionVariantRow[]> {
  const attempts = count(knowledgeBitVariantAttempts.id);
  const kindRank = sql<number>`case ${knowledgeBitQuestionVariants.kind} when 'basic' then 0 when 'fill_in_the_blank' then 1 else 2 end`;
  const picked = db
    .select({
      variantId: sql<string>`${knowledgeBitQuestionVariants.id}`.as("variant_id"),
      knowledgeBitId: sql<string>`${knowledgeBits.id}`.as("bit_id"),
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      bitBody: knowledgeBits.body,
      background: knowledgeBits.background,
      attempts: attempts.as("attempts"),
      kindRank: kindRank.as("kind_rank"),
      variantCreatedAt: knowledgeBitQuestionVariants.createdAt,
      pickRank: sql<number>`row_number() over (partition by ${knowledgeBits.id} order by ${attempts}, ${kindRank}, ${knowledgeBitQuestionVariants.createdAt}, ${knowledgeBitQuestionVariants.id})`
        .mapWith(Number)
        .as("pick_rank"),
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(
      knowledgeBitVariantAttempts,
      eq(knowledgeBitVariantAttempts.variantId, knowledgeBitQuestionVariants.id),
    )
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .where(
      and(
        eligible,
        or(
          isNull(knowledgeBitSchedules.knowledgeBitId),
          sql`${knowledgeBitSchedules.dueAt} <= now()`,
        ),
      ),
    )
    .groupBy(
      knowledgeBitQuestionVariants.id,
      knowledgeBitQuestionVariants.kind,
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.body,
      knowledgeBits.background,
    )
    .as("picked");

  const rows = await db
    .select({
      variantId: picked.variantId,
      kind: picked.kind,
      prompt: picked.prompt,
      knowledgeBitId: picked.knowledgeBitId,
      bitBody: picked.bitBody,
      background: picked.background,
    })
    .from(picked)
    .where(eq(picked.pickRank, 1))
    .orderBy(asc(picked.attempts), asc(picked.kindRank), asc(picked.variantCreatedAt))
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
