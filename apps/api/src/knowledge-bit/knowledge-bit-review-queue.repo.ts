import type {
  CardPhase,
  IntervalPreview,
  KnowledgeBitQuestionVariantKind,
  ReviewCounts,
} from "@post-anki/shared";
import { collectSubjectSubtreeIds, type SubjectHierarchyRow } from "@post-anki/core";
import type { SQL } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { getMixNewWithDue } from "../admin-settings/admin-settings.repo.js";
import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { getLocalDayWindow } from "./knowledge-bit-review.repo.js";
import { readStudyPlanClock } from "../study-plan/study-plan-today.js";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";
import type { ScheduleOptions } from "./knowledge-bit-grade-schedule.js";
import { interleaveNewWithSeen } from "./knowledge-bit-review-queue-mix.js";
import { readDailyReviewLimit } from "./knowledge-bit-review-queue-daily-limit.repo.js";
import { listParentMixCards } from "./knowledge-bit-review-queue-parent-mix.repo.js";
import { listLearnAheadRows } from "./knowledge-bit-review-queue-learning.repo.js";
import { pickedVariants, scopeCondition } from "./knowledge-bit-review-queue-picked.repo.js";
import {
  listPickedCards,
  listPickedNewCards,
  listScopedCards,
  toCard,
} from "./knowledge-bit-review-queue-cards.repo.js";
import {
  deriveUnscopedQueueCounts,
  readEligibleTotals,
  readFreshBySubject,
  readNewCardAllowance,
  summariseNewCardAllowance,
} from "./knowledge-bit-review-queue-counts.repo.js";

export type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";

export interface KnowledgeBitReviewCardRow {
  variantId: string;
  knowledgeBitId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  context?: string | null;
  answer: string;
  sentence?: string;
  cardKey?: string;
  background: string | null;
  isAiGenerated: boolean;
  aiSuggestion?: string | null;
  originalPhrase?: string;
  sourceLinks: string[];
  subjectId: string | null;
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
  limitReached?: boolean;
  reviewedToday?: number;
  limit?: number;
  nextDueAt: string | null;
}

export interface KnowledgeBitReviewQueueClock {
  tz: string;
  now: Date;
  aheadDays?: number;
}

// Unscoped: only due or never-reviewed bits, one card each, new cards capped per local day.
// Scoped (tag/topic/bit): today's behaviour, no due filter and no cap.
// The scoped subject plus every descendant; an unknown id matches nothing beyond itself.
async function resolveSubjectScope(
  subjectId: string,
  db: DbExecutor,
): Promise<{ ids: string[]; rows: SubjectHierarchyRow[] }> {
  const rows = await db
    .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
    .from(subjects);

  return { ids: collectSubjectSubtreeIds(subjectId, rows), rows };
}

async function listScopedBatch(
  limit: number,
  scope: SQL,
  filter: KnowledgeBitReviewCardsFilter,
  now: Date,
  db: DbExecutor,
  stepsFor: (subjectId: string | null) => ScheduleOptions,
  mixNewWithDue: boolean,
): Promise<KnowledgeBitReviewCardRow[]> {
  if (!mixNewWithDue) {
    return listScopedCards(limit, scope, filter, now, db, stepsFor);
  }

  const [seen, fresh] = await Promise.all([
    listScopedCards(limit, scope, filter, now, db, stepsFor, "seen"),
    listScopedCards(limit, scope, filter, now, db, stepsFor, "new"),
  ]);

  return interleaveNewWithSeen(seen, fresh, limit);
}

export async function getKnowledgeBitReviewQueue(
  limit: number,
  filter: KnowledgeBitReviewCardsFilter | undefined,
  clock: KnowledgeBitReviewQueueClock,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitReviewQueue> {
  const { now } = clock;
  const subjectScope = filter?.subjectId ? await resolveSubjectScope(filter.subjectId, db) : undefined;
  const scope = scopeCondition(filter, db, subjectScope?.ids);
  const picked = pickedVariants(scope, now, db);
  const [resolver, planClock] = await Promise.all([
    loadStudyOptionsResolver(db),
    readStudyPlanClock(now, db),
  ]);
  const stepsFor = (subjectId: string | null) =>
    toScheduleOptions(resolver.resolvePlan(subjectId), planClock);
  const [allowance, freshBySubject] = await Promise.all([
    readNewCardAllowance(clock, db, resolver),
    readFreshBySubject(picked, db),
  ]);
  const { remaining, newAvailable, capHidesNew } = summariseNewCardAllowance(allowance, freshBySubject);
  const { dayEndsAt } = allowance;
  const aheadDays = clock.aheadDays ?? 0;
  const [daily, mixNewWithDue] = await Promise.all([readDailyReviewLimit(clock, db), getMixNewWithDue(db)]);
  const dailyFields = { limitReached: daily.reached, reviewedToday: daily.reviewedToday, limit: daily.limit };
  const blockedByDailyLimit = daily.reached && aheadDays === 0;
  const subjectOnlyScope = Boolean(filter?.subjectId && !filter.tagId && !filter.topicId && !filter.knowledgeBitId);

  if (scope && filter) {
    const blocked = blockedByDailyLimit && subjectOnlyScope;
    const readCards = async (): Promise<KnowledgeBitReviewCardRow[]> => {
      if (blocked) {
        return [];
      }

      const mixed =
        subjectOnlyScope && subjectScope && filter.subjectId
          ? await listParentMixCards({
              rootId: filter.subjectId,
              subjectRows: subjectScope.rows,
              limit,
              clock,
              filter,
              db,
              stepsFor,
            })
          : null;

      return mixed ?? listScopedBatch(limit, scope, filter, now, db, stepsFor, mixNewWithDue);
    };
    const [cards, totals] = await Promise.all([readCards(), readEligibleTotals(picked, now, db)]);

    return {
      ...(subjectOnlyScope ? dailyFields : {}),
      cards,
      counts: { new: totals.fresh, learning: totals.learning, review: totals.due },
      newRemainingToday: remaining,
      newLimitReached: false,
      nextDueAt: (blocked ? dayEndsAt : totals.nextDue)?.toISOString() ?? null,
    };
  }

  const dueCutoff =
    aheadDays > 0
      ? (await getLocalDayWindow(clock.tz, new Date(now.getTime() + aheadDays * 86_400_000), db)).endsAt
      : now;
  const [dueCards, newCards, totals] = await Promise.all([
    blockedByDailyLimit ? Promise.resolve([]) : listPickedCards(picked, "due", limit, now, db, stepsFor, dueCutoff),
    blockedByDailyLimit
      ? Promise.resolve([])
      : listPickedNewCards(picked, freshBySubject, allowance, limit, now, db, stepsFor),
    readEligibleTotals(picked, now, db),
  ]);
  const withNew = mixNewWithDue
    ? interleaveNewWithSeen(dueCards, newCards, limit)
    : [...dueCards, ...newCards.slice(0, Math.max(0, limit - dueCards.length))];
  const aheadRows = blockedByDailyLimit
    ? []
    : await listLearnAheadRows(picked, aheadDays > 0 ? 0 : limit - withNew.length, now, db);
  const cards = [...withNew, ...aheadRows.map((row) => toCard(row, now, stepsFor))];
  const derived = deriveUnscopedQueueCounts(totals, { newAvailable, capHidesNew }, dayEndsAt);

  return {
    ...dailyFields,
    cards,
    counts: derived.counts,
    newRemainingToday: remaining,
    newLimitReached: derived.newLimitReached,
    nextDueAt: (blockedByDailyLimit ? dayEndsAt : derived.nextDue)?.toISOString() ?? null,
  };
}
