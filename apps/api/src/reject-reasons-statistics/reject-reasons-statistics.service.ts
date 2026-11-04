import {
  KNOWLEDGE_BIT_FEEDBACK_UNSPECIFIED,
  knowledgeBitFeedbackReasonSchema,
  type KnowledgeBitFeedbackReason,
  REJECT_SUBJECT_TYPES,
  type RejectReasonsStatistics,
  type RejectReasonTypeBreakdown,
  type RejectSubjectType,
} from "@post-anki/shared";
import { readRejectReasonRows, type RawRejectReasonRow } from "./reject-reasons-statistics.repo.js";
import { readWeeklyDecisionRows } from "./reject-reasons-weekly.repo.js";
import { readSubjectDecisionRows } from "./reject-reasons-by-subject.repo.js";
import { loadSubjectKindRows, pickRejectSubjectType } from "../subject/reject-subject-type.js";
import { buildBySubject } from "./reject-reasons-by-subject.js";
import { buildWeeklyTrend, TOP_REASONS, weeklyWindowStart } from "./reject-reasons-weekly.js";

export function buildRejectReasonsStatistics(rows: RawRejectReasonRow[]): RejectReasonsStatistics {
  const counts = new Map<KnowledgeBitFeedbackReason, number>();

  for (const row of rows) {
    const parsed = knowledgeBitFeedbackReasonSchema.safeParse(row.reasonCode);
    const reasonCode = parsed.success ? parsed.data : KNOWLEDGE_BIT_FEEDBACK_UNSPECIFIED;

    counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + row.count);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const reasons = [...counts.entries()]
    .map(([reasonCode, count]) => ({ reasonCode, count, share: total === 0 ? 0 : count / total }))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode));

  return { total, reasons };
}

export function buildBySubjectType(
  rows: RawRejectReasonRow[],
  typeOf: (subjectId: string | null) => RejectSubjectType,
): RejectReasonTypeBreakdown[] {
  return REJECT_SUBJECT_TYPES.map((subjectType) => {
    const { total, reasons } = buildRejectReasonsStatistics(
      rows.filter((row) => typeOf(row.subjectId ?? null) === subjectType),
    );

    return { subjectType, total, reasons };
  });
}

export async function getRejectReasonsStatistics(now: Date = new Date()): Promise<RejectReasonsStatistics> {
  const [reasonRows, weeklyRows, subjectRows, kindRows] = await Promise.all([
    readRejectReasonRows(),
    readWeeklyDecisionRows(weeklyWindowStart(now)),
    readSubjectDecisionRows(),
    loadSubjectKindRows(),
  ]);
  const statistics = buildRejectReasonsStatistics(reasonRows);
  const topCodes = statistics.reasons.slice(0, TOP_REASONS).map((reason) => reason.reasonCode);

  return {
    ...statistics,
    bySubjectType: buildBySubjectType(reasonRows, (subjectId) => pickRejectSubjectType(subjectId, kindRows)),
    weekly: buildWeeklyTrend(weeklyRows, topCodes, now),
    bySubject: buildBySubject(subjectRows),
  };
}
