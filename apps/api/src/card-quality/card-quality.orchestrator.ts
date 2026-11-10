import type { CardQualityByModelResponse, CardQualityModelRow } from "@post-anki/shared";
import {
  loadAverageRatingByModel,
  loadRejectReasonsByModel,
  loadStateCountsByModel,
  type ModelRatingRow,
  type ModelReasonRow,
  type ModelStateCounts,
} from "./card-quality.repo.js";

const DAY_MS = 86_400_000;
const TOP_REASONS = 3;

export function approvalRate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;

  return decided === 0 ? null : approved / decided;
}

function topReasons(rows: readonly ModelReasonRow[], modelId: string): CardQualityModelRow["topReasons"] {
  return rows
    .filter((row) => row.modelId === modelId)
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode))
    .slice(0, TOP_REASONS)
    .map(({ reasonCode, count }) => ({ reasonCode, count }));
}

export function buildCardQuality(
  counts: readonly ModelStateCounts[],
  ratings: readonly ModelRatingRow[],
  reasons: readonly ModelReasonRow[],
): CardQualityByModelResponse {
  const ratingByModel = new Map(ratings.map((row) => [row.modelId, row.averageRating]));
  const models = counts
    .map((row) => ({
      ...row,
      approvalRate: approvalRate(row.approved, row.rejected),
      averageRating: ratingByModel.get(row.modelId) ?? null,
      topReasons: topReasons(reasons, row.modelId),
    }))
    .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected) || a.modelId.localeCompare(b.modelId));

  return { models };
}

export async function getCardQualityByModel(days: number | undefined): Promise<CardQualityByModelResponse> {
  const since = days === undefined ? null : new Date(Date.now() - days * DAY_MS);
  const [counts, ratings, reasons] = await Promise.all([
    loadStateCountsByModel(since),
    loadAverageRatingByModel(since),
    loadRejectReasonsByModel(since),
  ]);

  return buildCardQuality(counts, ratings, reasons);
}
