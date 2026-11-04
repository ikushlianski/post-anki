import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitReviewExampleField } from './knowledge-bit-review-card-fields'

export function KnowledgeBitFocusExample({
  bit,
  version,
  onSaveBit,
  onBusyChange,
}: {
  bit: PendingKnowledgeBitForReview
  version: number
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
  onBusyChange: (busy: boolean) => void
}) {
  return (
    <div className="space-y-1">
      <KnowledgeBitReviewExampleField
        key={version}
        bitId={bit.id}
        example={bit.background ?? ''}
        muted
        onSave={(example) => onSaveBit(bit.id, bit.body, example)}
        onBusyChange={onBusyChange}
      />
      {bit.exampleAiGeneratedAt ? (
        <span
          data-testid={`knowledge-bit-focus-example-ai-tag-${bit.id}`}
          className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600"
        >
          AI
        </span>
      ) : null}
    </div>
  )
}
