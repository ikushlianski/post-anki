import { useState } from 'react'
import type { KnowledgeItemModelId } from '@post-anki/shared'

import { ExtractionModelSelect } from './extraction-model-select'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import type { SourceRegenerationState } from './knowledge-bit-review-regeneration'

export function KnowledgeBitReviewRegenerate({
  sourceId,
  undecidedCount,
  state,
  onRequest,
  onCancel,
  onConfirm,
  onRetry,
}: {
  sourceId: string
  undecidedCount: number
  state: SourceRegenerationState | undefined
  onRequest: () => void
  onCancel: () => void
  onConfirm: (modelId?: KnowledgeItemModelId) => void
  onRetry: () => void
}) {
  const [modelId, setModelId] = useState<KnowledgeItemModelId | ''>('')
  const testId = `knowledge-bit-review-regenerate-${sourceId}`

  if (!state) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onRequest}
        className={SECONDARY_BUTTON_CLASS}
      >
        Regenerate
      </button>
    )
  }

  if (state.phase === 'confirming') {
    return (
      <div data-testid={`${testId}-confirm-panel`} className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-neutral-700">
          Replace {undecidedCount} undecided {undecidedCount === 1 ? 'suggestion' : 'suggestions'}{' '}
          from this source? Approved and rejected ones stay.
        </p>
        <div className="w-full max-w-md sm:w-auto">
          <ExtractionModelSelect
            testId={`${testId}-model`}
            ariaLabel="Model for regeneration"
            emptyLabel="Same model as before"
            value={modelId}
            onChange={setModelId}
          />
        </div>
        <button
          type="button"
          data-testid={`${testId}-confirm`}
          onClick={() => onConfirm(modelId === '' ? undefined : modelId)}
          className={PRIMARY_BUTTON_CLASS}
        >
          Replace
        </button>
        <button
          type="button"
          data-testid={`${testId}-cancel`}
          onClick={onCancel}
          className={SECONDARY_BUTTON_CLASS}
        >
          Cancel
        </button>
      </div>
    )
  }

  if (state.phase === 'failed') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p data-testid={`${testId}-status`} role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
        <button
          type="button"
          data-testid={`${testId}-retry`}
          onClick={onRetry}
          className={SECONDARY_BUTTON_CLASS}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p data-testid={`${testId}-status`} aria-live="polite" className="text-sm text-neutral-600">
        Regenerating…
      </p>
      <button type="button" data-testid={testId} disabled className={SECONDARY_BUTTON_CLASS}>
        Regenerate
      </button>
    </div>
  )
}
