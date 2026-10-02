import { eq, sql } from "drizzle-orm";
import type { Verdict } from "@post-anki/shared";
import { knowledgeBitSchedules } from "../db/schema.js";
import { withSubjectLock } from "../shared/merge-lock.js";

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 180;
// A shaky answer grows toward this much lower ceiling, not the full 180-day cap — otherwise a bit
// that's chronically "NeedsReview" would still drift out to nearly a full-mastery interval, which
// is exactly the skim-past-it-before-it's-known failure mode this scheduler is meant to avoid.
const MAX_NEEDS_REVIEW_INTERVAL_DAYS = 14;
const RESET_INTERVAL_DAYS = 1;

export interface ScheduleState {
  easeFactor: number;
  intervalDays: number;
}

// Simplified SM-2: a good answer grows the interval by the current ease factor and nudges ease
// up; a shaky answer grows it only a little and nudges ease down; a failed answer resets the
// interval short so the bit comes back soon, without punishing ease as hard as a real lapse would.
export function computeNextSchedule(current: ScheduleState, verdict: Verdict): ScheduleState {
  if (verdict === "Ok") {
    const intervalDays = Math.min(
      Math.max(current.intervalDays, MIN_INTERVAL_DAYS) * current.easeFactor,
      MAX_INTERVAL_DAYS,
    );

    return {
      easeFactor: Math.min(current.easeFactor + 0.1, MAX_EASE_FACTOR),
      intervalDays,
    };
  }

  if (verdict === "NeedsReview") {
    const intervalDays = Math.min(
      Math.max(current.intervalDays, MIN_INTERVAL_DAYS) * 1.2,
      MAX_NEEDS_REVIEW_INTERVAL_DAYS,
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
      .where(eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId))
      .limit(1);

    const current: ScheduleState = existing[0] ?? { easeFactor: 2.5, intervalDays: 0 };
    const next = computeNextSchedule(current, verdict);
    const now = new Date();
    const dueAt = new Date(now.getTime() + next.intervalDays * 24 * 60 * 60 * 1000);

    await tx
      .insert(knowledgeBitSchedules)
      .values({
        knowledgeBitId,
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        dueAt,
        lastReviewedAt: now,
        reviewCount: 1,
      })
      .onConflictDoUpdate({
        target: knowledgeBitSchedules.knowledgeBitId,
        set: {
          easeFactor: next.easeFactor,
          intervalDays: next.intervalDays,
          dueAt,
          lastReviewedAt: now,
          reviewCount: sql`${knowledgeBitSchedules.reviewCount} + 1`,
        },
      });
  });
}
