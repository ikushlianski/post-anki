import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { PendingKnowledgeSourceForReview } from "@post-anki/shared";

import { getPendingKnowledgeBitsForReview } from "./knowledge-bit-review.api";
import {
  QUESTION_POLL_IDLE_LIMIT,
  hasBitAwaitingQuestions,
  mergeArrivedBits,
  mergeArrivedVariants,
  REGENERATION_POLL_MAX_ATTEMPTS,
  unseenBitIds,
  useQuestionPolling,
} from "./knowledge-bit-review-polling";
import { REGENERATION_POLL_INTERVAL_MS, type useSourceRegeneration } from "./knowledge-bit-review-regeneration";

export function useReviewQuestionRefresh({
  pendingSources,
  regeneration,
  reloadAfterRetry,
  rowErrors,
  setSources,
  knownBitIds,
  editingBitIds,
}: {
  pendingSources: PendingKnowledgeSourceForReview[];
  regeneration: ReturnType<typeof useSourceRegeneration>;
  reloadAfterRetry: (statuses: Awaited<ReturnType<ReturnType<typeof useSourceRegeneration>["fetchStatuses"]>>) => Promise<void>;
  rowErrors: Record<string, string | undefined>;
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>;
  knownBitIds: MutableRefObject<Set<string>>;
  editingBitIds: MutableRefObject<Set<string>>;
}) {
  const [idleStopped, setIdleStopped] = useState(false);
  const quietPolls = useRef(0);
  const { fetchStatuses, applyStatuses } = regeneration;

  const refreshQuestions = useCallback(async () => {
    const statuses = await fetchStatuses();
    const fresh = await getPendingKnowledgeBitsForReview();
    const arrived = new Set(unseenBitIds(fresh, knownBitIds.current));
    const protectedBitIds = new Set([
      ...editingBitIds.current,
      ...Object.keys(rowErrors).filter((bitId) => rowErrors[bitId]),
    ]);

    arrived.forEach((bitId) => knownBitIds.current.add(bitId));
    quietPolls.current = arrived.size > 0 ? 0 : quietPolls.current + 1;
    setIdleStopped(quietPolls.current >= QUESTION_POLL_IDLE_LIMIT);
    setSources((prev) =>
      mergeArrivedBits(mergeArrivedVariants(prev, fresh, protectedBitIds), fresh, arrived),
    );
    applyStatuses(statuses);
    await reloadAfterRetry(statuses);
  }, [rowErrors, fetchStatuses, applyStatuses, reloadAfterRetry, knownBitIds, editingBitIds, setSources]);

  return useQuestionPolling(
    hasBitAwaitingQuestions(pendingSources) || !idleStopped || regeneration.isRegenerating,
    refreshQuestions,
    regeneration.isRegenerating ? REGENERATION_POLL_INTERVAL_MS : undefined,
    regeneration.isRegenerating ? REGENERATION_POLL_MAX_ATTEMPTS : undefined,
  );
}
