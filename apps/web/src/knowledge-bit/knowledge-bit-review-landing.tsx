import type { ReactNode } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewBulkBar } from './knowledge-bit-review-bulk-bar'
import { KnowledgeBitReviewEmptyState } from './knowledge-bit-review-empty-state'
import { KnowledgeBitReviewRegenerate } from './knowledge-bit-review-regenerate'
import type {
  SourceRegenerationActions,
  SourceRegenerationState,
} from './knowledge-bit-review-regeneration'

interface KnowledgeBitReviewLandingProps {
  sources: PendingKnowledgeSourceForReview[]
  readyCount: number
  waitingCount: number
  showWaiting: boolean
  regenerationStates: Record<string, SourceRegenerationState | undefined>
  regenerationActions: SourceRegenerationActions
  bulk: {
    bulkMessage: string | null
    isConfirmingAll: boolean
    requestApproveAll: () => void
    confirmBulk: () => void
    cancelBulk: () => void
  }
  hasNotices?: boolean
  notices?: ReactNode
  children: ReactNode
}

export function KnowledgeBitReviewLanding({
  sources,
  readyCount,
  waitingCount,
  showWaiting,
  regenerationStates,
  regenerationActions,
  bulk,
  hasNotices = false,
  notices = null,
  children,
}: KnowledgeBitReviewLandingProps) {
  const total = readyCount + waitingCount
  const rows = sources.filter(
    (source) => source.bits.length > 0 || regenerationStates[source.knowledgeSourceId],
  )

  return (
    <div data-testid="knowledge-bit-review-landing" className="space-y-4">
      {notices}

      {total === 0 ? (
        hasNotices ? null : <KnowledgeBitReviewEmptyState />
      ) : (
        <p data-testid="knowledge-bit-review-count" className="text-lg font-medium text-neutral-900">
          {readyCount} {readyCount === 1 ? 'card is' : 'cards are'} waiting for your decision
        </p>
      )}

      {showWaiting && waitingCount > 0 ? (
        <p data-testid="knowledge-bit-review-progress" className="text-sm text-neutral-600">
          Writing cards… {readyCount} of {total} ready
        </p>
      ) : null}

      {children}

      <KnowledgeBitReviewBulkBar
        readyCount={readyCount}
        bulkMessage={bulk.bulkMessage}
        isConfirming={bulk.isConfirmingAll}
        onRequestApproveAll={bulk.requestApproveAll}
        onConfirmApproveAll={bulk.confirmBulk}
        onCancelApproveAll={bulk.cancelBulk}
      />

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((source) => (
            <li
              key={source.knowledgeSourceId}
              data-testid={`knowledge-bit-review-source-${source.knowledgeSourceId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-4 py-3"
            >
              <div className="min-w-0 text-sm text-neutral-700">
                <p className="font-medium text-neutral-900">
                  {source.subjectName ?? 'No subject'}
                </p>
                <p data-testid={`knowledge-bit-review-source-count-${source.knowledgeSourceId}`}>
                  {source.bits.length} {source.bits.length === 1 ? 'suggestion' : 'suggestions'}
                </p>
              </div>
              {source.sourceText ? (
                <KnowledgeBitReviewRegenerate
                  sourceId={source.knowledgeSourceId}
                  undecidedCount={source.bits.length}
                  state={regenerationStates[source.knowledgeSourceId]}
                  onRequest={() => regenerationActions.onRequest(source.knowledgeSourceId)}
                  onCancel={() => regenerationActions.onCancel(source.knowledgeSourceId)}
                  onConfirm={(modelId) =>
                    regenerationActions.onConfirm(source.knowledgeSourceId, modelId)
                  }
                  onRetry={() => regenerationActions.onRetry(source.knowledgeSourceId)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
