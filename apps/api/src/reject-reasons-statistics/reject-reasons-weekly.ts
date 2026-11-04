import {
  KNOWLEDGE_BIT_FEEDBACK_UNSPECIFIED,
  knowledgeBitFeedbackReasonSchema,
  type KnowledgeBitFeedbackReason,
  type RejectReasonWeek,
} from "@post-anki/shared";
import type { RawWeeklyDecisionRow } from "./reject-reasons-weekly.repo.js";

export const WEEKLY_BUCKETS = 12;
export const TOP_REASONS = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function currentWeekStart(now: Date): Date {
  const day = (now.getUTCDay() + 6) % 7;

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}

export function weeklyWindowStart(now: Date): Date {
  return new Date(currentWeekStart(now).getTime() - (WEEKLY_BUCKETS - 1) * WEEK_MS);
}

function normalizeReason(code: string | null): KnowledgeBitFeedbackReason {
  const parsed = knowledgeBitFeedbackReasonSchema.safeParse(code);

  return parsed.success ? parsed.data : KNOWLEDGE_BIT_FEEDBACK_UNSPECIFIED;
}

export function buildWeeklyTrend(
  rows: RawWeeklyDecisionRow[],
  topReasonCodes: KnowledgeBitFeedbackReason[],
  now: Date = new Date(),
): RejectReasonWeek[] {
  const start = weeklyWindowStart(now).getTime();
  const top = topReasonCodes.slice(0, TOP_REASONS);

  return Array.from({ length: WEEKLY_BUCKETS }, (_, index) => {
    const weekStart = isoDate(new Date(start + index * WEEK_MS));
    const weekRows = rows.filter((row) => row.weekStart === weekStart);
    const decided = weekRows.reduce((sum, row) => sum + row.count, 0);
    const rejectedRows = weekRows.filter((row) => row.rejected);
    const rejected = rejectedRows.reduce((sum, row) => sum + row.count, 0);
    const topReasons = top.map((reasonCode) => ({
      reasonCode,
      count: rejectedRows
        .filter((row) => normalizeReason(row.reasonCode) === reasonCode)
        .reduce((sum, row) => sum + row.count, 0),
    }));

    return { weekStart, rejected, decided, rejectRate: decided === 0 ? 0 : rejected / decided, topReasons };
  });
}
