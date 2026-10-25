import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewAttentionNotice } from './knowledge-bit-review-attention-notice'
import type { SourceRegenerationActions, SourceRegenerationState } from './knowledge-bit-review-regeneration'

export function KnowledgeBitReviewAttentionBlock({
  notices,
  states,
  actions,
  onDiscard,
}: {
  notices: PendingKnowledgeSourceForReview[]
  states: Record<string, SourceRegenerationState | undefined>
  actions: Pick<SourceRegenerationActions, 'onRetry' | 'onRetryWithText'>
  onDiscard: (sourceId: string) => Promise<boolean>
}) {
  if (notices.length === 0) {
    return null
  }

  const retryable = notices.filter((notice) => {
    const phase = states[notice.knowledgeSourceId]?.phase

    return notice.attention && phase !== 'starting' && phase !== 'running'
  })

  return (
    <section data-testid="knowledge-bit-review-attention" aria-labelledby="knowledge-bit-review-attention-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="knowledge-bit-review-attention-title" className="text-base font-semibold text-neutral-900">
          Needs attention ({notices.length})
        </h2>
        {notices.length > 1 ? (
          <button
            type="button"
            data-testid="knowledge-bit-review-attention-retry-all"
            disabled={retryable.length === 0}
            onClick={() => retryable.forEach((notice) => actions.onRetry(notice.knowledgeSourceId))}
            className="min-h-11 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0 sm:py-1.5"
          >
            Retry all ({retryable.length})
          </button>
        ) : null}
      </div>
      <ul className="space-y-3">
        {notices.map((notice) => (
          <KnowledgeBitReviewAttentionNotice
            key={notice.knowledgeSourceId}
            source={notice}
            regeneration={states[notice.knowledgeSourceId]}
            onRetry={actions.onRetry}
            onRetryWithText={actions.onRetryWithText}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
    </section>
  )
}
