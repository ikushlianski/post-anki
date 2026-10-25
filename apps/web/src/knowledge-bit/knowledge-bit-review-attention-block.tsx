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

  return (
    <section data-testid="knowledge-bit-review-attention" aria-labelledby="knowledge-bit-review-attention-title" className="space-y-3">
      <h2 id="knowledge-bit-review-attention-title" className="text-base font-semibold text-neutral-900">
        Needs attention ({notices.length})
      </h2>
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
