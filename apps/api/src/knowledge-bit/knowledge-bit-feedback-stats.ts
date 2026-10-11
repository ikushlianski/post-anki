import type {
  KnowledgeBitFeedbackByModelResponse,
  KnowledgeBitFeedbackReason,
} from "@post-anki/shared";

export function buildModelStats(
  rows: Array<{ modelId: string | null; verdict: string; reasonCode: string | null; count: number }>,
): KnowledgeBitFeedbackByModelResponse {
  const byModel = new Map<
    string,
    { approved: number; rejected: number; reasons: Map<KnowledgeBitFeedbackReason, number> }
  >();

  for (const row of rows) {
    const key = row.modelId ?? "unknown";
    const entry = byModel.get(key) ?? { approved: 0, rejected: 0, reasons: new Map() };

    if (row.verdict === "approved") {
      entry.approved += row.count;
    } else if (row.verdict === "rejected") {
      entry.rejected += row.count;

      const reason = (row.reasonCode ?? "unspecified") as KnowledgeBitFeedbackReason;

      entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + row.count);
    }

    byModel.set(key, entry);
  }

  return {
    models: [...byModel.entries()]
      .map(([modelId, entry]) => ({
        modelId,
        approved: entry.approved,
        rejected: entry.rejected,
        topReasons: [...entry.reasons.entries()]
          .map(([reasonCode, count]) => ({ reasonCode, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
      }))
      .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected)),
  };
}
