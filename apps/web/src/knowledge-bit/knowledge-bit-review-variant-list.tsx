import { useState, type ReactNode } from "react";
import type { PendingKnowledgeBitQuestionVariant } from "@post-anki/shared";

import { KnowledgeBitReviewCardFields } from "./knowledge-bit-review-card-fields";
import { KnowledgeBitReviewVariantPicker } from "./knowledge-bit-review-variant-picker";
import { shownVariants, variantLabel } from "./knowledge-bit-triage-selection";

export function KnowledgeBitReviewVariantList({
  bitId,
  variants,
  pollingGaveUp,
  keptIds = [],
  pickDisabled = false,
  defaultOpen = false,
  prominentMain = false,
  afterMain = null,
  onToggle,
  onSave,
  onBusyChange,
}: {
  bitId: string;
  variants: PendingKnowledgeBitQuestionVariant[];
  pollingGaveUp: boolean;
  keptIds?: string[];
  pickDisabled?: boolean;
  defaultOpen?: boolean;
  prominentMain?: boolean;
  afterMain?: ReactNode;
  onToggle?: (index: number) => void;
  onSave: (
    variantId: string,
    prompt: string,
    answer: string,
  ) => Promise<boolean>;
  onBusyChange: (key: string, busy: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (variants.length === 0) {
    return (
      <div
        data-testid={`knowledge-bit-review-no-variants-${bitId}`}
        className="flex items-center gap-2 py-3 text-sm text-neutral-500"
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 animate-pulse rounded-full bg-neutral-400 motion-reduce:animate-none"
        />
        {pollingGaveUp
          ? "Still waiting. Reload the page to check again."
          : "Writing cards…"}
      </div>
    );
  }

  const [main, ...variations] = shownVariants(variants);

  return (
    <div
      data-testid={`knowledge-bit-review-variants-${bitId}`}
      className="space-y-3"
    >
      {main ? (
        <div
          data-testid={`knowledge-bit-review-variant-${bitId}-${main.id}`}
          data-role="main"
          className="space-y-2"
        >
          <KnowledgeBitReviewCardFields
            variant={main}
            prominent={prominentMain}
            onSave={onSave}
            onBusyChange={(busy) => onBusyChange("card-0", busy)}
          />
        </div>
      ) : null}
      {afterMain}
      {variations.length > 0 ? (
        <>
          <button
            type="button"
            data-testid={`knowledge-bit-review-variations-toggle-${bitId}`}
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className="min-h-11 text-xs font-medium text-neutral-600 hover:text-neutral-900 sm:min-h-8"
          >
            {open ? "Hide variations" : `Variations (${variations.length})`}
          </button>
          <div
            data-testid={`knowledge-bit-review-variations-${bitId}`}
            hidden={!open}
            className="grid items-start gap-4 md:grid-cols-2"
          >
            {variations.map((variant, offset) => {
              const index = offset + 1;

              return (
                <div
                  key={`card-${index}`}
                  data-testid={`knowledge-bit-review-variant-${bitId}-${variant.id}`}
                  data-role="variation"
                  className="space-y-2"
                >
                  {onToggle ? (
                    <KnowledgeBitReviewVariantPicker
                      bitId={bitId}
                      variantId={variant.id}
                      number={index + 1}
                      label={variantLabel(shownVariants(variants), index)}
                      selected={keptIds.includes(variant.id)}
                      disabled={pickDisabled}
                      onToggle={() => onToggle(index)}
                    />
                  ) : null}
                  <KnowledgeBitReviewCardFields
                    variant={variant}
                    onSave={onSave}
                    onBusyChange={(busy) => onBusyChange(`card-${index}`, busy)}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
