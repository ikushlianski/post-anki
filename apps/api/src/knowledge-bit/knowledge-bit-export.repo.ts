import { and, asc, eq, exists, gt, inArray, isNull } from "drizzle-orm";
import type { KnowledgeBitOverviewState } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  subjects,
  tagAssignments,
  tags,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { deriveOverviewState } from "./knowledge-bit-overview-state.js";
import { pickPreferredVariants } from "./knowledge-bit-preferred-variant.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";

export const EXPORT_BATCH_SIZE = 200;

export interface ExportedReview {
  reviewedAt: string;
  grade: string;
  wasNew: boolean;
  durationMs: number | null;
}

export interface ExportedQuestion {
  question: string;
  answer: string;
}

export interface ExportedCard {
  id: string;
  question: string;
  answer: string;
  otherQuestions: ExportedQuestion[];
  topic: string | null;
  tags: string[];
  addedAt: string;
  example: string | null;
  subject: string | null;
  sourceLinks: string[];
  state: KnowledgeBitOverviewState;
  dueAt: string | null;
  intervalDays: number | null;
  ease: number | null;
  lapses: number;
  reviewCount: number;
  lastReviewedAt: string | null;
  reviews: ExportedReview[];
}

async function loadReviews(ids: string[], db: DbExecutor): Promise<Map<string, ExportedReview[]>> {
  const rows = await db
    .select({
      knowledgeBitId: knowledgeBitReviews.knowledgeBitId,
      reviewedAt: knowledgeBitReviews.reviewedAt,
      grade: knowledgeBitReviews.grade,
      wasNew: knowledgeBitReviews.wasNew,
      durationMs: knowledgeBitReviews.durationMs,
    })
    .from(knowledgeBitReviews)
    .where(and(inArray(knowledgeBitReviews.knowledgeBitId, ids), isNull(knowledgeBitReviews.undoneAt)))
    .orderBy(asc(knowledgeBitReviews.reviewedAt));

  const byBit = new Map<string, ExportedReview[]>();

  for (const row of rows) {
    const list = byBit.get(row.knowledgeBitId) ?? [];

    list.push({
      reviewedAt: row.reviewedAt.toISOString(),
      grade: row.grade,
      wasNew: row.wasNew,
      durationMs: row.durationMs,
    });
    byBit.set(row.knowledgeBitId, list);
  }

  return byBit;
}

async function loadTags(ids: string[], db: DbExecutor): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ nodeId: tagAssignments.nodeId, name: tags.name })
    .from(tagAssignments)
    .innerJoin(tags, eq(tags.id, tagAssignments.tagId))
    .where(and(eq(tagAssignments.nodeType, "knowledgeBit"), inArray(tagAssignments.nodeId, ids)))
    .orderBy(asc(tags.name));

  const byBit = new Map<string, string[]>();

  for (const row of rows) {
    byBit.set(row.nodeId, [...(byBit.get(row.nodeId) ?? []), row.name]);
  }

  return byBit;
}

async function loadBatch(afterId: string, now: Date, db: DbExecutor) {
  const bits = await db
    .select({
      id: knowledgeBits.id,
      example: knowledgeBits.background,
      sourceLinks: knowledgeBits.sourceLinks,
      subject: subjects.name,
      topic: topics.title,
      addedAt: knowledgeBits.createdAt,
      phase: knowledgeBitSchedules.phase,
      scheduled: knowledgeBitSchedules.knowledgeBitId,
      dueAt: knowledgeBitSchedules.dueAt,
      intervalDays: knowledgeBitSchedules.intervalDays,
      ease: knowledgeBitSchedules.easeFactor,
      lapses: knowledgeBitSchedules.lapses,
      reviewCount: knowledgeBitSchedules.reviewCount,
      lastReviewedAt: knowledgeBitSchedules.lastReviewedAt,
      suspendedAt: knowledgeBitSchedules.suspendedAt,
      buriedUntil: knowledgeBitSchedules.buriedUntil,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(subjects, eq(subjects.id, effectiveSubjectIdSql))
    .where(
      and(
        bitApproved,
        gt(knowledgeBits.id, afterId),
        exists(
          db
            .select({ one: knowledgeBitQuestionVariants.id })
            .from(knowledgeBitQuestionVariants)
            .where(
              and(
                eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBits.id),
                isNull(knowledgeBitQuestionVariants.supersededAt),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(knowledgeBits.id))
    .limit(EXPORT_BATCH_SIZE);

  if (bits.length === 0) {
    return { lastId: afterId, cards: [] as ExportedCard[], done: true };
  }

  const ids = bits.map((bit) => bit.id);
  const variantRows = await db
    .select({
      id: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      createdAt: knowledgeBitQuestionVariants.createdAt,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(knowledgeBitQuestionVariants.knowledgeBitId, ids),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );

  const variants = pickPreferredVariants(variantRows);
  const reviews = await loadReviews(ids, db);
  const tagsByBit = await loadTags(ids, db);
  const othersByBit = new Map<string, ExportedQuestion[]>();

  for (const row of [...variantRows].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    if (variants.get(row.knowledgeBitId)?.id === row.id) {
      continue;
    }

    othersByBit.set(row.knowledgeBitId, [
      ...(othersByBit.get(row.knowledgeBitId) ?? []),
      { question: row.prompt, answer: row.answer },
    ]);
  }

  const cards = bits.flatMap((bit): ExportedCard[] => {
    const variant = variants.get(bit.id);

    if (!variant) {
      return [];
    }

    const scheduled = bit.scheduled !== null;

    return [
      {
        id: bit.id,
        question: variant.prompt,
        answer: variant.answer,
        otherQuestions: othersByBit.get(bit.id) ?? [],
        topic: bit.topic,
        tags: tagsByBit.get(bit.id) ?? [],
        addedAt: bit.addedAt.toISOString(),
        example: bit.example,
        subject: bit.subject,
        sourceLinks: bit.sourceLinks ?? [],
        state: deriveOverviewState(
          scheduled
            ? { phase: bit.phase ?? "review", suspendedAt: bit.suspendedAt, buriedUntil: bit.buriedUntil }
            : null,
          now,
        ),
        dueAt: bit.dueAt?.toISOString() ?? null,
        intervalDays: scheduled ? bit.intervalDays : null,
        ease: scheduled ? bit.ease : null,
        lapses: bit.lapses ?? 0,
        reviewCount: bit.reviewCount ?? 0,
        lastReviewedAt: bit.lastReviewedAt?.toISOString() ?? null,
        reviews: reviews.get(bit.id) ?? [],
      },
    ];
  });

  return { lastId: ids[ids.length - 1] ?? afterId, cards, done: bits.length < EXPORT_BATCH_SIZE };
}

// Approved cards in id order, one bounded batch at a time, so memory stays flat.
export async function* streamApprovedCards(
  now: Date,
  db: DbExecutor = getDb(),
): AsyncGenerator<ExportedCard[]> {
  let afterId = "";

  for (;;) {
    const batch = await loadBatch(afterId, now, db);

    if (batch.cards.length > 0) {
      yield batch.cards;
    }

    if (batch.done) {
      return;
    }

    afterId = batch.lastId;
  }
}
