import { useState } from "react";
import type { PendingKnowledgeBitForReview } from "@post-anki/shared";

import {
  keepIds,
  keepsEveryVariant,
  toggleVariant,
} from "./knowledge-bit-triage-selection";

export interface ReviewTriageControls {
  selections: Record<string, string[] | undefined>;
  onToggle?: (bitId: string, index: number) => void;
  onKeep?: (bitId: string) => void;
}

export function useReviewTriage({
  findBit,
  approve,
  keepVariants,
}: {
  findBit: (bitId: string) => PendingKnowledgeBitForReview | undefined;
  approve: (bitId: string) => Promise<void>;
  keepVariants: (bitId: string, keepVariantIds: string[]) => Promise<void>;
}): ReviewTriageControls {
  const [selections, setSelections] = useState<
    Record<string, string[] | undefined>
  >({});

  function onToggle(bitId: string, index: number) {
    const bit = findBit(bitId);

    if (!bit) {
      return;
    }

    setSelections((prev) => ({
      ...prev,
      [bitId]: toggleVariant(bit.variants, prev[bitId], index),
    }));
  }

  function onKeep(bitId: string) {
    const bit = findBit(bitId);

    if (!bit || bit.variants.length === 0) {
      return;
    }

    if (keepsEveryVariant(bit.variants, selections[bitId])) {
      void approve(bitId);

      return;
    }

    void keepVariants(bitId, keepIds(bit.variants, selections[bitId]));
  }

  return { selections, onToggle, onKeep };
}
