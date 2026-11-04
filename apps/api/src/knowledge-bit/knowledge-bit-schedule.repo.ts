import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  cardPhaseSchema,
  LONG_TERM_MAX_INTERVAL_DAYS,
  type CardPhase,
  type Verdict,
} from "@post-anki/shared";
import { knowledgeBitSchedules } from "../db/schema.js";
import { withSubjectLock, type Tx } from "../shared/merge-lock.js";
import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { readStudyPlanClock } from "../study-plan/study-plan-today.js";
import { readCardSubjectId } from "./knowledge-bit-card-subject.js";
import { applyRetention } from "./knowledge-bit-grade-schedule.js";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = LONG_TERM_MAX_INTERVAL_DAYS;
// A shaky answer grows toward this much lower ceiling, not the full long-term cap — otherwise a bit
// that's chronically "NeedsReview" would still drift out to nearly a full-mastery interval, which
// is exactly the skim-past-it-before-it's-known failure mode this scheduler is meant to avoid.
const MAX_NEEDS_REVIEW_INTERVAL_DAYS = 14;
const RESET_INTERVAL_DAYS = 1;

const SCHEDULE_KEY = [knowledgeBitSchedules.knowledgeBitId, knowledgeBitSchedules.cardKey];

export const scheduleKeyIs = (knowledgeBitId: string, cardKey: string) =>
  and(
    eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId),
    eq(knowledgeBitSchedules.cardKey, cardKey),
  );

export interface ScheduleState {
  easeFactor: number;
  intervalDays: number;
}

// Simplified SM-2: a good answer grows the interval by the current ease factor and nudges ease
// up; a shaky answer grows it only a little and nudges ease down; a failed answer resets the
// interval short so the bit comes back soon, without punishing ease as hard as a real lapse would.
export interface TypedScheduleLimits {
  maxIntervalDays?: number;
  retentionMultiplier?: number;
}

export function computeNextSchedule(
  current: ScheduleState,
  verdict: Verdict,
  limits: TypedScheduleLimits = {},
): ScheduleState {
  const maxInterval = Math.max(MIN_INTERVAL_DAYS, limits.maxIntervalDays ?? MAX_INTERVAL_DAYS);

  if (verdict === "Ok") {
    const base = Math.max(current.intervalDays, MIN_INTERVAL_DAYS);
    const grown = applyRetention(
      "good",
      base * current.easeFactor,
      base,
      current.easeFactor,
      limits.retentionMultiplier ?? 1,
    );
    const intervalDays = Math.min(grown, maxInterval);

    return {
      easeFactor: Math.min(current.easeFactor + 0.1, MAX_EASE_FACTOR),
      intervalDays,
    };
  }

  if (verdict === "NeedsReview") {
    const intervalDays = Math.min(
      Math.max(current.intervalDays, MIN_INTERVAL_DAYS) * 1.2,
      Math.min(MAX_NEEDS_REVIEW_INTERVAL_DAYS, maxInterval),
    );

    return {
      easeFactor: Math.max(current.easeFactor - 0.05, MIN_EASE_FACTOR),
      intervalDays,
    };
  }

  return {
    easeFactor: Math.max(current.easeFactor - 0.2, MIN_EASE_FACTOR),
    intervalDays: RESET_INTERVAL_DAYS,
  };
}

// Upserted after every graded attempt (see grade-knowledge-bit-variant-answer.orchestrator.ts) —
// reads the prior state, computes the next ease/interval/due date, and writes it back in one row
// per bit. Serialized per bit via withSubjectLock, so two variants of the same bit graded
// concurrently can't clobber each other.
export async function reviewKnowledgeBitSchedule(
  knowledgeBitId: string,
  verdict: Verdict,
): Promise<void> {
  await withSubjectLock(knowledgeBitId, async (tx) => {
    const existing = await tx
      .select({
        easeFactor: knowledgeBitSchedules.easeFactor,
        intervalDays: knowledgeBitSchedules.intervalDays,
      })
      .from(knowledgeBitSchedules)
      .where(scheduleKeyIs(knowledgeBitId, ""))
      .limit(1);

    const current: ScheduleState = existing[0] ?? { easeFactor: 2.5, intervalDays: 0 };
    const now = new Date();
    const [subjectId, resolver, clock] = await Promise.all([
      readCardSubjectId(knowledgeBitId, tx),
      loadStudyOptionsResolver(tx),
      readStudyPlanClock(now, tx),
    ]);
    const limits = toScheduleOptions(resolver.resolvePlan(subjectId), clock);
    const next = computeNextSchedule(current, verdict, limits);
    const dueAt = new Date(now.getTime() + next.intervalDays * 24 * 60 * 60 * 1000);

    await tx
      .insert(knowledgeBitSchedules)
      .values({
        knowledgeBitId,
        cardKey: "",
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        dueAt,
        lastReviewedAt: now,
        reviewCount: 1,
        phase: "review",
        learningStep: 0,
      })
      .onConflictDoUpdate({
        target: SCHEDULE_KEY,
        set: {
          easeFactor: next.easeFactor,
          intervalDays: next.intervalDays,
          dueAt,
          phase: "review",
          learningStep: 0,
          lastReviewedAt: now,
          reviewCount: sql`${knowledgeBitSchedules.reviewCount} + 1`,
        },
      });
  });
}

export interface KnowledgeBitScheduleRow {
  easeFactor: number;
  intervalDays: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  reviewCount: number;
  phase: CardPhase;
  learningStep: number;
  lapses: number;
  suspendedAt: Date | null;
  buriedUntil: Date | null;
}

// Not suspended and not buried; a card with no schedule row passes.
export const inReviewRotation = (now: Date) =>
  and(
    isNull(knowledgeBitSchedules.suspendedAt),
    or(isNull(knowledgeBitSchedules.buriedUntil), lte(knowledgeBitSchedules.buriedUntil, now)),
  );

// Reads the full schedule row inside the caller's transaction, so a grade can snapshot it first.
export async function readKnowledgeBitScheduleInTx(
  tx: Tx,
  knowledgeBitId: string,
  cardKey: string,
): Promise<KnowledgeBitScheduleRow | null> {
  const rows = await tx
    .select({
      easeFactor: knowledgeBitSchedules.easeFactor,
      intervalDays: knowledgeBitSchedules.intervalDays,
      dueAt: knowledgeBitSchedules.dueAt,
      lastReviewedAt: knowledgeBitSchedules.lastReviewedAt,
      reviewCount: knowledgeBitSchedules.reviewCount,
      phase: knowledgeBitSchedules.phase,
      learningStep: knowledgeBitSchedules.learningStep,
      lapses: knowledgeBitSchedules.lapses,
      suspendedAt: knowledgeBitSchedules.suspendedAt,
      buriedUntil: knowledgeBitSchedules.buriedUntil,
    })
    .from(knowledgeBitSchedules)
    .where(scheduleKeyIs(knowledgeBitId, cardKey))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  const phase = cardPhaseSchema.safeParse(row.phase);

  return { ...row, phase: phase.success ? phase.data : "review" };
}

export async function upsertKnowledgeBitScheduleInTx(
  tx: Tx,
  knowledgeBitId: string,
  cardKey: string,
  next: ScheduleState & {
    dueAt: Date;
    phase: CardPhase;
    learningStep: number;
    lapses: number;
    suspendedAt?: Date;
  },
  now: Date,
): Promise<void> {
  await tx
    .insert(knowledgeBitSchedules)
    .values({
      knowledgeBitId,
      cardKey,
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      dueAt: next.dueAt,
      lastReviewedAt: now,
      reviewCount: 1,
      phase: next.phase,
      learningStep: next.learningStep,
      lapses: next.lapses,
      suspendedAt: next.suspendedAt ?? null,
    })
    .onConflictDoUpdate({
      target: SCHEDULE_KEY,
      set: {
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        dueAt: next.dueAt,
        phase: next.phase,
        learningStep: next.learningStep,
        lapses: next.lapses,
        ...(next.suspendedAt ? { suspendedAt: next.suspendedAt } : {}),
        lastReviewedAt: now,
        reviewCount: sql`${knowledgeBitSchedules.reviewCount} + 1`,
      },
    });
}

export async function replaceKnowledgeBitScheduleInTx(
  tx: Tx,
  knowledgeBitId: string,
  cardKey: string,
  row: KnowledgeBitScheduleRow,
): Promise<void> {
  await tx
    .insert(knowledgeBitSchedules)
    .values({ knowledgeBitId, cardKey, ...row })
    .onConflictDoUpdate({ target: SCHEDULE_KEY, set: row });
}

export interface KnowledgeBitScheduleControls {
  suspendedAt: Date | null;
  buriedUntil: Date | null;
}

// A card never graded gets an ungraded row (reviewCount 0), which readers treat as new.
export async function writeKnowledgeBitScheduleControlsInTx(
  tx: Tx,
  knowledgeBitId: string,
  cardKey: string,
  controls: KnowledgeBitScheduleControls,
): Promise<void> {
  await tx
    .insert(knowledgeBitSchedules)
    .values({ knowledgeBitId, cardKey, reviewCount: 0, phase: "new", ...controls })
    .onConflictDoUpdate({ target: SCHEDULE_KEY, set: controls });
}
