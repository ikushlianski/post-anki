import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  tagAssignments,
  topics,
} from "../db/schema.js";
import { ANKI_VARIANT_KIND_PREFERENCE, ankiVariantKindRank } from "./knowledge-bit-variant-kind-rules.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { inReviewRotation } from "./knowledge-bit-schedule.repo.js";
import type { KnowledgeBitReviewCardsFilter } from "./knowledge-bit-review-queue.repo.js";

// subjectIds is the subject plus its descendants, resolved by the caller. A placed bit
// belongs to its curriculum's subject; an unplaced bit to its source's subject.
export function scopeCondition(
  filter: KnowledgeBitReviewCardsFilter | undefined,
  db: DbExecutor,
  subjectIds?: string[],
) {
  if (filter?.knowledgeBitId) {
    return eq(knowledgeBits.id, filter.knowledgeBitId);
  }

  if (filter?.topicId) {
    return eq(knowledgeBits.topicId, filter.topicId);
  }

  if (filter?.tagId) {
    return inArray(
      knowledgeBits.id,
      db
        .select({ id: tagAssignments.nodeId })
        .from(tagAssignments)
        .where(
          and(eq(tagAssignments.tagId, filter.tagId), eq(tagAssignments.nodeType, "knowledgeBit")),
        ),
    );
  }

  if (subjectIds) {
    return or(
      inArray(curricula.subjectId, subjectIds),
      and(isNull(knowledgeBits.topicId), inArray(knowledgeSources.subjectId, subjectIds)),
    );
  }

  return undefined;
}

export const eligibility = (scope: SQL | undefined, now: Date) =>
  and(
    scope,
    inReviewRotation(now),
    or(isNull(knowledgeBits.topicId), ne(topics.learningStatus, "skipping")),
    isNull(knowledgeBitQuestionVariants.supersededAt),
    bitApproved,
  );

// One row per eligible bit: the active variant shown least recently, ties by kind preference.
export function pickedVariants(scope: SQL | undefined, now: Date, db: DbExecutor) {
  const kindRank = sql`case ${knowledgeBitQuestionVariants.kind} ${sql.join(
    ANKI_VARIANT_KIND_PREFERENCE.map((kind) => sql`when ${kind} then ${ankiVariantKindRank(kind)}`),
    sql` `,
  )} else ${ANKI_VARIANT_KIND_PREFERENCE.length} end`;

  const lastShownAt = sql`greatest(
    coalesce((select max(r.reviewed_at) from knowledge_bit_reviews r where r.variant_id = ${knowledgeBitQuestionVariants.id} and r.undone_at is null), '-infinity'::timestamptz),
    coalesce((select max(a.created_at) from knowledge_bit_variant_attempts a where a.variant_id = ${knowledgeBitQuestionVariants.id}), '-infinity'::timestamptz)
  )`;

  return db
    .select({
      variantId: sql<string>`${knowledgeBitQuestionVariants.id}`.as("variant_id"),
      knowledgeBitId: sql<string>`${knowledgeBits.id}`.as("bit_id"),
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      background: knowledgeBits.background,
      isAiGenerated: knowledgeBits.isAiGenerated,
      sourceLinks: knowledgeBits.sourceLinks,
      subjectId: knowledgeSources.subjectId,
      bitCreatedAt: knowledgeBits.createdAt,
      scheduleBitId: sql<string | null>`case when ${knowledgeBitSchedules.reviewCount} > 0 then ${knowledgeBitSchedules.knowledgeBitId} end`.as("schedule_bit_id"),
      easeFactor: knowledgeBitSchedules.easeFactor,
      intervalDays: knowledgeBitSchedules.intervalDays,
      dueAt: sql<Date | null>`case when ${knowledgeBitSchedules.reviewCount} > 0 then ${knowledgeBitSchedules.dueAt} end`.as("due_at"),
      phase: knowledgeBitSchedules.phase,
      learningStep: knowledgeBitSchedules.learningStep,
      lapses: knowledgeBitSchedules.lapses,
      pickRank: sql<number>`row_number() over (partition by ${knowledgeBits.id} order by ${lastShownAt}, ${kindRank}, ${knowledgeBitQuestionVariants.createdAt}, ${knowledgeBitQuestionVariants.id})`
        .mapWith(Number)
        .as("pick_rank"),
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(eligibility(scope, now))
    .as("picked");
}

export type Picked = ReturnType<typeof pickedVariants>;
