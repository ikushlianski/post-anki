import { and, asc, count, eq, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type {
  CardPhase,
  IntervalPreview,
  KnowledgeBitQuestionVariantKind,
  ReviewCounts,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBits,
  knowledgeBitSchedules,
  tagAssignments,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";
import { previewGradeIntervals } from "./knowledge-bit-grade-schedule.js";
import {
  countNewCardsReviewedToday,
  getLocalDayWindow,
  NEW_CARDS_PER_DAY,
} from "./knowledge-bit-review.repo.js";

export interface KnowledgeBitReviewCardRow {
  variantId: string;
  knowledgeBitId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
  background: string | null;
  phase: CardPhase;
  intervalPreview: IntervalPreview;
}

export interface KnowledgeBitReviewCardsFilter {
  tagId?: string;
  topicId?: string;
  knowledgeBitId?: string;
}

export interface KnowledgeBitReviewQueue {
  cards: KnowledgeBitReviewCardRow[];
  counts: ReviewCounts;
  newRemainingToday: number;
  nextDueAt: string | null;
}

export interface KnowledgeBitReviewQueueClock {
  tz: string;
  now: Date;
}

function scopeCondition(filter: KnowledgeBitReviewCardsFilter | undefined, db: DbExecutor) {
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

  return undefined;
}

const eligibility = (scope: SQL | undefined) =>
  and(
    scope,
    or(isNull(knowledgeBits.topicId), ne(topics.learningStatus, "skipping")),
    isNull(knowledgeBitQuestionVariants.supersededAt),
    bitApproved,
  );

function toCard(
  row: Omit<KnowledgeBitReviewCardRow, "phase" | "intervalPreview" | "kind"> & {
    kind: string;
    isNew: boolean;
    easeFactor: number | null;
    intervalDays: number | null;
  },
  now: Date,
): KnowledgeBitReviewCardRow {
  const { isNew, easeFactor, intervalDays, ...card } = row;
  const state =
    easeFactor === null || intervalDays === null ? null : { easeFactor, intervalDays };

  return {
    ...card,
    kind: card.kind as KnowledgeBitQuestionVariantKind,
    phase: isNew ? "new" : "review",
    intervalPreview: previewGradeIntervals(state, now),
  };
}

// Scoped queues keep fair cycling by review count; topic scope sorts due bits first.
async function listScopedCards(
  limit: number,
  scope: SQL,
  filter: KnowledgeBitReviewCardsFilter,
  now: Date,
  db: DbExecutor,
): Promise<KnowledgeBitReviewCardRow[]> {
  const reviewCount = count(knowledgeBitReviews.id);
  const dueRank = sql<number>`min(case when ${knowledgeBitSchedules.knowledgeBitId} is null or ${knowledgeBitSchedules.dueAt} <= now() then 0 else 1 end)`;

  const rows = await db
    .select({
      variantId: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBits.id,
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      background: knowledgeBits.background,
      easeFactor: knowledgeBitSchedules.easeFactor,
      intervalDays: knowledgeBitSchedules.intervalDays,
      isNew: sql<boolean>`bool_and(${knowledgeBitSchedules.knowledgeBitId} is null)`,
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(knowledgeBitReviews, eq(knowledgeBitReviews.variantId, knowledgeBitQuestionVariants.id))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .where(eligibility(scope))
    .groupBy(
      knowledgeBitQuestionVariants.id,
      knowledgeBitQuestionVariants.kind,
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.answer,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.background,
      knowledgeBitSchedules.easeFactor,
      knowledgeBitSchedules.intervalDays,
    )
    .orderBy(
      ...(filter.topicId ? [asc(dueRank)] : []),
      asc(reviewCount),
      asc(knowledgeBitQuestionVariants.createdAt),
    )
    .limit(limit);

  return rows.map((row) => toCard(row, now));
}

// One row per eligible bit: basic over fill_in_the_blank over the rest.
function pickedVariants(scope: SQL | undefined, db: DbExecutor) {
  const kindRank = sql`case ${knowledgeBitQuestionVariants.kind} when 'basic' then 0 when 'fill_in_the_blank' then 1 else 2 end`;

  return db
    .select({
      variantId: sql<string>`${knowledgeBitQuestionVariants.id}`.as("variant_id"),
      knowledgeBitId: sql<string>`${knowledgeBits.id}`.as("bit_id"),
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      background: knowledgeBits.background,
      bitCreatedAt: knowledgeBits.createdAt,
      scheduleBitId: knowledgeBitSchedules.knowledgeBitId,
      easeFactor: knowledgeBitSchedules.easeFactor,
      intervalDays: knowledgeBitSchedules.intervalDays,
      dueAt: knowledgeBitSchedules.dueAt,
      pickRank: sql<number>`row_number() over (partition by ${knowledgeBits.id} order by ${kindRank}, ${knowledgeBitQuestionVariants.createdAt}, ${knowledgeBitQuestionVariants.id})`
        .mapWith(Number)
        .as("pick_rank"),
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .where(eligibility(scope))
    .as("picked");
}

type Picked = ReturnType<typeof pickedVariants>;

async function listPickedCards(
  picked: Picked,
  kind: "due" | "new",
  limit: number,
  now: Date,
  db: DbExecutor,
): Promise<KnowledgeBitReviewCardRow[]> {
  if (limit <= 0) {
    return [];
  }

  const condition =
    kind === "due" ? lte(picked.dueAt, now) : isNull(picked.scheduleBitId);
  const rows = await db
    .select({
      variantId: picked.variantId,
      knowledgeBitId: picked.knowledgeBitId,
      kind: picked.kind,
      prompt: picked.prompt,
      answer: picked.answer,
      background: picked.background,
      easeFactor: picked.easeFactor,
      intervalDays: picked.intervalDays,
      isNew: sql<boolean>`${picked.scheduleBitId} is null`,
    })
    .from(picked)
    .where(and(eq(picked.pickRank, 1), condition))
    .orderBy(kind === "due" ? asc(picked.dueAt) : asc(picked.bitCreatedAt), asc(picked.variantId))
    .limit(limit);

  return rows.map((row) => toCard(row, now));
}

async function readEligibleTotals(picked: Picked, now: Date, db: DbExecutor) {
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const [row] = await db
    .select({
      due: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql})`.mapWith(Number),
      fresh: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      nextDue: sql<Date | null>`min(${picked.dueAt}) filter (where ${picked.dueAt} > ${nowSql})`,
    })
    .from(picked)
    .where(eq(picked.pickRank, 1));

  return {
    due: row?.due ?? 0,
    fresh: row?.fresh ?? 0,
    nextDue: row?.nextDue ? new Date(row.nextDue) : null,
  };
}

async function readNewRemainingToday(
  { tz, now }: KnowledgeBitReviewQueueClock,
  db: DbExecutor,
): Promise<{ remaining: number; dayEndsAt: Date }> {
  const { startsAt, endsAt } = await getLocalDayWindow(tz, now, db);
  const newToday = await countNewCardsReviewedToday(startsAt, db);

  return { remaining: Math.max(0, NEW_CARDS_PER_DAY - newToday), dayEndsAt: endsAt };
}

// Unscoped: only due or never-reviewed bits, one card each, new cards capped per local day.
// Scoped (tag/topic/bit): today's behaviour, no due filter and no cap.
export async function getKnowledgeBitReviewQueue(
  limit: number,
  filter: KnowledgeBitReviewCardsFilter | undefined,
  clock: KnowledgeBitReviewQueueClock,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitReviewQueue> {
  const { now } = clock;
  const scope = scopeCondition(filter, db);
  const picked = pickedVariants(scope, db);
  const { remaining, dayEndsAt } = await readNewRemainingToday(clock, db);

  if (scope && filter) {
    const [cards, totals] = await Promise.all([
      listScopedCards(limit, scope, filter, now, db),
      readEligibleTotals(picked, now, db),
    ]);

    return {
      cards,
      counts: { new: totals.fresh, learning: 0, review: totals.due },
      newRemainingToday: remaining,
      nextDueAt: totals.nextDue?.toISOString() ?? null,
    };
  }

  const [dueCards, newCards, totals] = await Promise.all([
    listPickedCards(picked, "due", limit, now, db),
    listPickedCards(picked, "new", Math.min(limit, remaining), now, db),
    readEligibleTotals(picked, now, db),
  ]);
  const cards = [...dueCards, ...newCards.slice(0, Math.max(0, limit - dueCards.length))];
  const capHidesNew = remaining === 0 && totals.fresh > 0;
  const nextDue =
    capHidesNew && (!totals.nextDue || dayEndsAt < totals.nextDue) ? dayEndsAt : totals.nextDue;

  return {
    cards,
    counts: { new: Math.min(totals.fresh, remaining), learning: 0, review: totals.due },
    newRemainingToday: remaining,
    nextDueAt: nextDue?.toISOString() ?? null,
  };
}
