import type { LearningListItem } from "@post-anki/shared";

export type ResolveRecommendationError =
  | "not_found"
  | "not_awaiting_decision"
  | "subject_not_found"
  | "extend_target_missing"
  | "extend_target_busy"
  // learning-list-fold-in — defensive only: `withPlacementFallback`
  // (learning-list-classification.orchestrator.ts) already guarantees a
  // stored `fold_in` recommendation always carries a non-null areaId/
  // areaName, so this should be unreachable in practice. Kept as a typed
  // error rather than a thrown exception so a data inconsistency here still
  // fails the same clean, catchable way every other branch does.
  | "fold_in_area_missing";

export interface ApprovedRecommendation {
  item: LearningListItem;
  curriculumId: string;
}

export const DEFAULT_PLACEMENT_DEPTH = "working" as const;

export function sourcesForItem(item: LearningListItem) {
  if (item.kind === "video") {
    return item.rawText
      ? [{ kind: "text" as const, value: item.rawText, title: item.title ?? undefined }]
      : [];
  }

  return item.url
    ? [{ kind: "link" as const, value: item.url, title: item.title ?? undefined }]
    : [];
}
