import { useState } from 'react'
import { attentionWording, type PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewAttentionEdit } from './knowledge-bit-review-attention-edit'
import { formatAttentionAge } from './knowledge-bit-review-attention-time'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import type { SourceRegenerationState } from './knowledge-bit-review-regeneration'

type Mode = 'idle' | 'editing' | 'confirmingDiscard' | 'discarding'

const DISCARD_FAILED_MESSAGE = "Couldn't discard this note. Try again."

export function KnowledgeBitReviewAttentionNotice({
  source,
  regeneration,
  onRetry,
  onRetryWithText,
  onDiscard,
}: {
  source: PendingKnowledgeSourceForReview
  regeneration: SourceRegenerationState | undefined
  onRetry: (sourceId: string) => void
  onRetryWithText: (sourceId: string, text: string) => void
  onDiscard: (sourceId: string) => Promise<boolean>
}) {
  const [mode, setMode] = useState<Mode>('idle')
  const [discardError, setDiscardError] = useState<string | null>(null)
  const attention = source.attention
  const sourceId = source.knowledgeSourceId
  const testId = `knowledge-bit-review-attention-${sourceId}`

  if (!attention) {
    return null
  }

  const busy = regeneration?.phase === 'starting' || regeneration?.phase === 'running'
  const isInfo = attention.kind === 'rate_limited'
  const fullText = attention.sourceText ?? source.sourceText ?? ''

  async function confirmDiscard() {
    setMode('discarding')
    setDiscardError(null)

    const removed = await onDiscard(sourceId)

    if (!removed) {
      setDiscardError(DISCARD_FAILED_MESSAGE)
      setMode('idle')
    }
  }

  return (
    <li
      data-testid={testId}
      data-kind={attention.kind}
      className={`space-y-3 rounded-2xl border p-4 ${
        isInfo ? 'border-sky-200 bg-sky-50' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <div className="min-w-0">
        <p data-testid={`${testId}-first-words`} className="break-words font-medium text-neutral-900">
          {attention.firstWords || 'Untitled note'}
        </p>
        <p data-testid={`${testId}-time`} className="text-xs text-neutral-600">
          {formatAttentionAge(attention.since)}
        </p>
        <p data-testid={`${testId}-reason`} className="mt-1 text-sm text-neutral-800">
          {attentionWording(attention.kind, attention.reason)}
        </p>
      </div>

      {fullText ? (
        <details data-testid={`${testId}-details`} className="text-sm text-neutral-700">
          <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium sm:min-h-0 sm:py-1">
            Show note text
          </summary>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-white p-3">
            {fullText}
          </p>
        </details>
      ) : null}

      {busy ? (
        <p data-testid={`${testId}-status`} aria-live="polite" className="text-sm text-neutral-700">
          Retrying…
        </p>
      ) : null}

      {regeneration?.phase === 'failed' ? (
        <p role="alert" data-testid={`${testId}-error`} className="text-sm text-red-700">
          {regeneration.message}
        </p>
      ) : null}

      {discardError ? (
        <p role="alert" data-testid={`${testId}-discard-error`} className="text-sm text-red-700">
          {discardError}
        </p>
      ) : null}

      {isInfo || busy ? null : mode === 'editing' ? (
        <KnowledgeBitReviewAttentionEdit
          sourceId={sourceId}
          initialText={fullText}
          onSubmit={(text) => {
            setMode('idle')
            onRetryWithText(sourceId, text)
          }}
          onCancel={() => setMode('idle')}
        />
      ) : mode === 'confirmingDiscard' || mode === 'discarding' ? (
        <div data-testid={`${testId}-discard-panel`} className="space-y-2">
          <p className="text-sm text-neutral-800">
            Discard this note? Its text will be deleted. Cards you already approved stay.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-testid={`${testId}-discard-confirm`}
              disabled={mode === 'discarding'}
              onClick={() => void confirmDiscard()}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:px-3 sm:text-xs"
            >
              {mode === 'discarding' ? 'Discarding…' : 'Discard note'}
            </button>
            <button
              type="button"
              data-testid={`${testId}-discard-cancel`}
              disabled={mode === 'discarding'}
              onClick={() => setMode('idle')}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            data-testid={`${testId}-retry`}
            onClick={() => onRetry(sourceId)}
            className={PRIMARY_BUTTON_CLASS}
          >
            Retry now
          </button>
          <button
            type="button"
            data-testid={`${testId}-edit`}
            onClick={() => setMode('editing')}
            className={SECONDARY_BUTTON_CLASS}
          >
            Edit text and retry
          </button>
          <button
            type="button"
            data-testid={`${testId}-discard`}
            onClick={() => setMode('confirmingDiscard')}
            className={SECONDARY_BUTTON_CLASS}
          >
            Discard
          </button>
        </div>
      )}
    </li>
  )
}
