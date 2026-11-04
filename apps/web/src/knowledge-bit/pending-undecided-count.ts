import { useRef } from "react";
import type { PendingKnowledgeSourceForReview } from "@post-anki/shared";

export function computeUndecidedCount({
  total,
  loadedBitIds,
  resolvedBitIds,
  localCount,
}: {
  total: number | undefined;
  loadedBitIds: ReadonlySet<string>;
  resolvedBitIds: Iterable<string>;
  localCount: number;
}): number {
  if (total === undefined) {
    return localCount;
  }

  let resolvedInPage = 0;

  for (const bitId of new Set(resolvedBitIds)) {
    if (loadedBitIds.has(bitId)) {
      resolvedInPage += 1;
    }
  }

  return Math.max(total - resolvedInPage, localCount);
}

export function usePendingUndecidedCount(
  initialSources: PendingKnowledgeSourceForReview[],
  total: number | undefined,
  pendingSources: PendingKnowledgeSourceForReview[],
  decisions: Record<string, unknown>,
  extras: { inboxedIds: ReadonlySet<string>; chattedIds: ReadonlySet<string> },
): number {
  const loadedBitIds = useRef(
    new Set(
      initialSources.flatMap((source) => source.bits.map((bit) => bit.id)),
    ),
  );

  return computeUndecidedCount({
    total,
    loadedBitIds: loadedBitIds.current,
    resolvedBitIds: [
      ...Object.keys(decisions),
      ...extras.inboxedIds,
      ...extras.chattedIds,
    ],
    localCount: pendingSources.reduce(
      (sum, source) => sum + source.bits.length,
      0,
    ),
  });
}
