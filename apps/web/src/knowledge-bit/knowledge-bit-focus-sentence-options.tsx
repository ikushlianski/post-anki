import type { PendingKnowledgeBitQuestionVariant } from "@post-anki/shared";

function hasTextSelection(): boolean {
  return (window.getSelection()?.toString() ?? "") !== "";
}

export function KnowledgeBitFocusSentenceOptions({
  bitId,
  variants,
  selectedIndex,
  onSelect,
}: {
  bitId: string;
  variants: PendingKnowledgeBitQuestionVariant[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      data-testid={`knowledge-bit-focus-options-${bitId}`}
      className="space-y-3"
    >
      {variants[selectedIndex]?.context ? (
        <p
          data-testid="knowledge-bit-focus-options-context"
          className="text-xs text-neutral-500"
        >
          {variants[selectedIndex]?.context}
        </p>
      ) : null}
      <p
        data-testid="knowledge-bit-focus-options-front"
        className="text-2xl font-semibold leading-snug text-neutral-900"
      >
        {variants[selectedIndex]?.prompt}
      </p>
      <div
        role="radiogroup"
        aria-label="Choose the sentence for the card back"
        className="space-y-2"
      >
        {variants.map((variant, index) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={index === selectedIndex}
            data-testid={`knowledge-bit-focus-option-${variant.id}`}
            onClick={() => {
              if (!hasTextSelection()) {
                onSelect(index);
              }
            }}
            className={`min-h-12 w-full cursor-text select-text rounded-lg px-4 py-2 text-left text-lg text-neutral-900 ${
              index === selectedIndex
                ? "bg-white ring-2 ring-neutral-900"
                : "bg-neutral-100/70 ring-1 ring-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {variant.answer}
          </button>
        ))}
      </div>
      <p className="hidden text-xs text-neutral-500 sm:block">
        Up/Down choose, Return good, X no
      </p>
    </div>
  );
}
