import type { ReactNode } from "react";
import type { PendingKnowledgeBitForReview } from "@post-anki/shared";

import { KnowledgeBitFocusSentenceOptions } from "./knowledge-bit-focus-sentence-options";
import type { NoteMode } from "./knowledge-bit-review-note-edit";
import { KnowledgeBitReviewVariantList } from "./knowledge-bit-review-variant-list";

interface KnowledgeBitFocusVariantsProps {
  bit: PendingKnowledgeBitForReview;
  pollingGaveUp: boolean;
  selectedIndex: number;
  onSelect?: (index: number) => void;
  exampleSlot: ReactNode;
  onSaveVariant: (
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
    context?: string | null,
  ) => Promise<boolean>;
  onSaveNote?: (
    bitId: string,
    variantId: string,
    mode: NoteMode,
    text: string,
  ) => Promise<boolean>;
  onBusyChange: (key: string, busy: boolean) => void;
}

export function KnowledgeBitFocusVariants({
  bit,
  pollingGaveUp,
  selectedIndex,
  onSelect,
  exampleSlot,
  onSaveVariant,
  onSaveNote,
  onBusyChange,
}: KnowledgeBitFocusVariantsProps) {
  if (bit.answerChoice && bit.variants.length > 1) {
    return (
      <>
        <KnowledgeBitFocusSentenceOptions
          bitId={bit.id}
          variants={bit.variants}
          selectedIndex={selectedIndex}
          onSelect={(index) => onSelect?.(index)}
        />
        {exampleSlot}
      </>
    );
  }

  return (
    <KnowledgeBitReviewVariantList
      bitId={bit.id}
      variants={bit.variants}
      pollingGaveUp={pollingGaveUp}
      defaultOpen
      prominentMain
      afterMain={exampleSlot}
      onSave={(variantId, prompt, answer, context) =>
        onSaveVariant(bit.id, variantId, prompt, answer, context)
      }
      onSaveNote={
        onSaveNote
          ? (variantId, mode, text) =>
              onSaveNote(bit.id, variantId, mode, text)
          : undefined
      }
      onBusyChange={onBusyChange}
    />
  );
}
