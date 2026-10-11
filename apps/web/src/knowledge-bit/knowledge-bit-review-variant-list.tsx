import type { PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

import { KnowledgeBitReviewCardFields } from './knowledge-bit-review-card-fields'

export function KnowledgeBitReviewVariantList({
  bitId,
  variants,
  pollingGaveUp,
  onSave,
  onBusyChange,
}: {
  bitId: string
  variants: PendingKnowledgeBitQuestionVariant[]
  pollingGaveUp: boolean
  onSave: (variantId: string, prompt: string, answer: string) => Promise<boolean>
  onBusyChange: (key: string, busy: boolean) => void
}) {
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
        {pollingGaveUp ? 'Still waiting. Reload the page to check again.' : 'Writing cards…'}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {variants.map((variant, index) => (
        <KnowledgeBitReviewCardFields
          key={`card-${index}`}
          variant={variant}
          onSave={onSave}
          onBusyChange={(busy) => onBusyChange(`card-${index}`, busy)}
        />
      ))}
    </div>
  )
}
