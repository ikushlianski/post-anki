import { and, eq, isNull, sql } from "drizzle-orm";
import type { ReviewCounts } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import {
  loadStudyOptionsResolver,
  type StudyOptionsResolver,
} from "../subject-study-options/subject-study-options-resolver.js";
import { deriveSubjectDayLimit } from "../study-plan/study-plan-allowance.js";
import { readPlanDayCounts } from "../study-plan/study-plan-day.repo.js";
import { readStudyPlanClock } from "../study-plan/study-plan-today.js";
import { learnAheadUntil } from "./knowledge-bit-review-queue-learning.repo.js";
import { pickedVariants, type Picked } from "./knowledge-bit-review-queue-picked.repo.js";
import type { KnowledgeBitReviewQueueClock } from "./knowledge-bit-review-queue.repo.js";
import {
  countNewCardsReviewedTodayBySubject,
  getLocalDayWindow,
} from "./knowledge-bit-review.repo.js";

export async function readEligibleTotals(picked: Picked, now: Date, db: DbExecutor) {
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const learnAheadSql = sql`${learnAheadUntil(now).toISOString()}::timestamptz`;
  const [row] = await db
    .select({
      due: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql} and ${picked.phase} not in ('learning', 'relearning'))`.mapWith(Number),
      learning: sql<number>`count(*) filter (where ${picked.dueAt} <= ${learnAheadSql} and ${picked.phase} in ('learning', 'relearning'))`.mapWith(Number),
      fresh: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      nextDue: sql<Date | null>`min(${picked.dueAt}) filter (where ${picked.dueAt} > ${nowSql})`,
    })
    .from(picked)
    .where(eq(picked.pickRank, 1));

  return {
    due: row?.due ?? 0,
    learning: row?.learning ?? 0,
    fresh: row?.fresh ?? 0,
    nextDue: row?.nextDue ? new Date(row.nextDue) : null,
  };
}

export interface NewCardAllowance {
  dayEndsAt: Date;
  remainingFor: (subjectId: string | null) => number;
}

export interface FreshBySubject {
  subjectId: string | null;
  fresh: number;
}

export async function readNewCardAllowance(
  { tz, now }: KnowledgeBitReviewQueueClock,
  db: DbExecutor,
  resolver?: StudyOptionsResolver,
): Promise<NewCardAllowance> {
  const { startsAt, endsAt } = await getLocalDayWindow(tz, now, db);
  const [usedBySubject, options] = await Promise.all([
    countNewCardsReviewedTodayBySubject(startsAt, db),
    resolver ?? loadStudyOptionsResolver(db),
  ]);
  const examContext = options.hasExamSubjects
    ? await Promise.all([readStudyPlanClock(now, db), readPlanDayCounts(now, db)])
    : null;

  return {
    dayEndsAt: endsAt,
    remainingFor: (subjectId) => {
      const used = usedBySubject.get(subjectId) ?? 0;

      if (examContext) {
        const plan = options.resolvePlan(subjectId);

        if (plan.intent === "exam") {
          const [clock, counts] = examContext;
          const { limit } = deriveSubjectDayLimit({
            plan,
            clock,
            counts: counts.get(subjectId) ?? { fresh: 0, waiting: 0 },
            usedToday: used,
          });

          return Math.max(0, limit - used);
        }
      }

      return Math.max(0, options.resolve(subjectId).effective.newCardsPerDay - used);
    },
  };
}

export async function readFreshBySubject(picked: Picked, db: DbExecutor): Promise<FreshBySubject[]> {
  const rows = await db
    .select({
      subjectId: picked.cardSubjectId,
      fresh: sql<number>`count(*)`.mapWith(Number),
    })
    .from(picked)
    .where(and(eq(picked.pickRank, 1), isNull(picked.scheduleBitId)))
    .groupBy(picked.cardSubjectId);

  return rows.map((row) => ({ subjectId: row.subjectId, fresh: row.fresh }));
}

export function summariseNewCardAllowance(
  allowance: NewCardAllowance,
  freshBySubject: FreshBySubject[],
): { remaining: number; newAvailable: number; capHidesNew: boolean } {
  const inPlay = freshBySubject.filter((entry) => entry.fresh > 0);

  if (inPlay.length === 0) {
    return { remaining: allowance.remainingFor(null), newAvailable: 0, capHidesNew: false };
  }

  return {
    remaining: inPlay.reduce((sum, entry) => sum + allowance.remainingFor(entry.subjectId), 0),
    newAvailable: inPlay.reduce(
      (sum, entry) => sum + Math.min(entry.fresh, allowance.remainingFor(entry.subjectId)),
      0,
    ),
    capHidesNew: inPlay.some((entry) => allowance.remainingFor(entry.subjectId) === 0),
  };
}

export function deriveUnscopedQueueCounts(
  totals: Awaited<ReturnType<typeof readEligibleTotals>>,
  allowance: number | { newAvailable: number; capHidesNew: boolean },
  dayEndsAt: Date,
): { counts: ReviewCounts; newLimitReached: boolean; nextDue: Date | null } {
  const { newAvailable, capHidesNew } =
    typeof allowance === "number"
      ? { newAvailable: Math.min(totals.fresh, allowance), capHidesNew: allowance === 0 && totals.fresh > 0 }
      : allowance;
  const nextDue =
    capHidesNew && (!totals.nextDue || dayEndsAt < totals.nextDue) ? dayEndsAt : totals.nextDue;

  return {
    counts: { new: newAvailable, learning: totals.learning, review: totals.due },
    newLimitReached: capHidesNew,
    nextDue,
  };
}

export async function readNewRemainingToday(
  clock: KnowledgeBitReviewQueueClock,
  db: DbExecutor,
): Promise<{ remaining: number; dayEndsAt: Date }> {
  const picked = pickedVariants(undefined, clock.now, db);
  const [allowance, freshBySubject] = await Promise.all([
    readNewCardAllowance(clock, db),
    readFreshBySubject(picked, db),
  ]);

  return {
    remaining: summariseNewCardAllowance(allowance, freshBySubject).remaining,
    dayEndsAt: allowance.dayEndsAt,
  };
}
