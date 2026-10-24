import type {
  CardPhase,
  IntervalPreview,
  KnowledgeBitQuestionVariantKind,
  ReviewCounts,
} from "@post-anki/shared";
import { collectSubjectSubtreeIds } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { listLearnAheadRows } from "./knowledge-bit-review-queue-learning.repo.js";
import { pickedVariants, scopeCondition } from "./knowledge-bit-review-queue-picked.repo.js";
import {
  listPickedCards,
  listScopedCards,
  toCard,
} from "./knowledge-bit-review-queue-cards.repo.js";
import {
  readEligibleTotals,
  readNewRemainingToday,
} from "./knowledge-bit-review-queue-counts.repo.js";

export type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";

export interface KnowledgeBitReviewCardRow {
  variantId: string;
  knowledgeBitId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
  background: string | null;
  isAiGenerated: boolean;
  sourceLinks: string[];
  phase: CardPhase;
  leech: boolean;
  intervalPreview: IntervalPreview;
}

export interface KnowledgeBitReviewCardsFilter {
  tagId?: string;
  topicId?: string;
  knowledgeBitId?: string;
  subjectId?: string;
}

export interface KnowledgeBitReviewQueue {
  cards: KnowledgeBitReviewCardRow[];
  counts: ReviewCounts;
  newRemainingToday: number;
  newLimitReached: boolean;
  nextDueAt: string | null;
}

export interface KnowledgeBitReviewQueueClock {
  tz: string;
  now: Date;
}

// Unscoped: only due or never-reviewed bits, one card each, new cards capped per local day.
// Scoped (tag/topic/bit): today's behaviour, no due filter and no cap.
// The scoped subject plus every descendant; an unknown id matches nothing beyond itself.
async function resolveSubjectScopeIds(subjectId: string, db: DbExecutor): Promise<string[]> {
  const rows = await db
    .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
    .from(subjects);

  return collectSubjectSubtreeIds(subjectId, rows);
}

export async function getKnowledgeBitReviewQueue(
  limit: number,
  filter: KnowledgeBitReviewCardsFilter | undefined,
  clock: KnowledgeBitReviewQueueClock,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitReviewQueue> {
  const { now } = clock;
  const subjectIds = filter?.subjectId ? await resolveSubjectScopeIds(filter.subjectId, db) : undefined;
  const scope = scopeCondition(filter, db, subjectIds);
  const picked = pickedVariants(scope, now, db);
  const { remaining, dayEndsAt } = await readNewRemainingToday(clock, db);

  if (scope && filter) {
    const [cards, totals] = await Promise.all([
      listScopedCards(limit, scope, filter, now, db),
      readEligibleTotals(picked, now, db),
    ]);

    return {
      cards,
      counts: { new: totals.fresh, learning: totals.learning, review: totals.due },
      newRemainingToday: remaining,
      newLimitReached: false,
      nextDueAt: totals.nextDue?.toISOString() ?? null,
    };
  }

  const [dueCards, newCards, totals] = await Promise.all([
    listPickedCards(picked, "due", limit, now, db),
    listPickedCards(picked, "new", Math.min(limit, remaining), now, db),
    readEligibleTotals(picked, now, db),
  ]);
  const withNew = [...dueCards, ...newCards.slice(0, Math.max(0, limit - dueCards.length))];
  const aheadRows = await listLearnAheadRows(picked, limit - withNew.length, now, db);
  const cards = [...withNew, ...aheadRows.map((row) => toCard(row, now))];
  const capHidesNew = remaining === 0 && totals.fresh > 0;
  const nextDue =
    capHidesNew && (!totals.nextDue || dayEndsAt < totals.nextDue) ? dayEndsAt : totals.nextDue;

  return {
    cards,
    counts: {
      new: Math.min(totals.fresh, remaining),
      learning: totals.learning,
      review: totals.due,
    },
    newRemainingToday: remaining,
    newLimitReached: capHidesNew,
    nextDueAt: nextDue?.toISOString() ?? null,
  };
}
