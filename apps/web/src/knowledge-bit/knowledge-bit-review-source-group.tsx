import type { KnowledgeItemModelId, PendingKnowledgeSourceForReview } from '@post-anki/shared'

import { KnowledgeBitReviewItem } from './knowledge-bit-review-item'
import { KnowledgeBitReviewBulkConfirm } from './knowledge-bit-review-bulk-confirm'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { KnowledgeBitReviewSourceSummary } from './knowledge-bit-review-source-summary'
import { KnowledgeBitReviewRegenerate } from './knowledge-bit-review-regenerate'
import type { ReviewDecisions } from './use-review-decisions'
import type { ReviewTriageControls } from './use-review-triage'
import type { SourceRegenerationState } from './knowledge-bit-review-regeneration'

export interface SourceRegenerationActions {
  onRequest: (sourceId: string) => void
  onCancel: (sourceId: string) => void
  onConfirm: (sourceId: string, modelId?: KnowledgeItemModelId) => void
  onRetry: (sourceId: string) => void
}

const NO_TRIAGE: ReviewTriageControls = { selections: {} }

const SOURCE_TEXT_PREVIEW_LENGTH = 2000

export function KnowledgeBitReviewSourceGroup({
  source,
  focusedBitId,
  decisions,
  pollingGaveUp,
  rowErrors,
  isBitResolving,
  isConfirmingBulk,
  triage = NO_TRIAGE,
  regeneration,
  regenerationActions,
  onRequestApproveSource,
  onConfirmBulk,
  onCancelBulk,
  onEditingChange,
  onApprove,
  onReject,
  onUndo,
  onGrade,
  hideGrading,
  onSaveVariant,
  onSaveBit,
}: {
  source: PendingKnowledgeSourceForReview
  focusedBitId: string | undefined
  decisions: ReviewDecisions
  pollingGaveUp: boolean
  rowErrors: Record<string, string>
  isBitResolving: (bitId: string) => boolean
  isConfirmingBulk: boolean
  triage?: ReviewTriageControls
  regeneration: SourceRegenerationState | undefined
  regenerationActions: SourceRegenerationActions
  onRequestApproveSource: (sourceId: string) => void
  onConfirmBulk: () => void
  onCancelBulk: () => void
  onEditingChange: (bitId: string, editing: boolean) => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
  onUndo: (bitId: string) => void
  onGrade: (bitId: string) => void
  hideGrading?: boolean
  onSaveVariant: (
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
  ) => Promise<boolean>
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
}) {
  const plainText = (source.sourceText ?? '').replace(/\s+/g, ' ').trim()
  const pendingBits = source.bits.filter((bit) => !decisions[bit.id])
  const readyCount = pendingBits.filter((bit) => bit.variants.length > 0).length

  return (
    <li
      data-testid={`knowledge-bit-review-source-${source.knowledgeSourceId}`}
      className="space-y-4 rounded-2xl bg-neutral-50 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-neutral-600">
          {source.subjectName ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {source.subjectName}
            </p>
          ) : null}
          <p className="font-medium text-neutral-700">Source text</p>
          <p
            data-testid={`knowledge-bit-review-source-text-${source.knowledgeSourceId}`}
            className="mt-2 break-words text-sm leading-relaxed text-neutral-700"
          >
            {plainText.length > 0
              ? plainText.slice(0, SOURCE_TEXT_PREVIEW_LENGTH)
              : 'No source text available.'}
            {plainText.length > SOURCE_TEXT_PREVIEW_LENGTH ? '…' : ''}
          </p>
        </div>

        {source.sourceText ? (
          <KnowledgeBitReviewRegenerate
            sourceId={source.knowledgeSourceId}
            undecidedCount={pendingBits.length}
            state={regeneration}
            onRequest={() => regenerationActions.onRequest(source.knowledgeSourceId)}
            onCancel={() => regenerationActions.onCancel(source.knowledgeSourceId)}
            onConfirm={(modelId) => regenerationActions.onConfirm(source.knowledgeSourceId, modelId)}
            onRetry={() => regenerationActions.onRetry(source.knowledgeSourceId)}
          />
        ) : null}

        {readyCount > 1 ? (
          isConfirmingBulk ? (
            <KnowledgeBitReviewBulkConfirm
              count={readyCount}
              confirmTestId={`knowledge-bit-review-approve-source-confirm-${source.knowledgeSourceId}`}
              cancelTestId={`knowledge-bit-review-approve-source-cancel-${source.knowledgeSourceId}`}
              onConfirm={onConfirmBulk}
              onCancel={onCancelBulk}
            />
          ) : (
            <button
              type="button"
              data-testid={`knowledge-bit-review-approve-source-${source.knowledgeSourceId}`}
              onClick={() => onRequestApproveSource(source.knowledgeSourceId)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Approve all from this source
            </button>
          )
        ) : null}
      </div>

      <KnowledgeBitReviewSourceSummary
        sourceId={source.knowledgeSourceId}
        summary={source.summary}
        sourceUrl={source.sourceUrl}
      />

      <ul className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {source.bits.map((bit) => (
          <KnowledgeBitReviewItem
            key={bit.id}
            bit={bit}
            isResolving={isBitResolving(bit.id)}
            decision={decisions[bit.id]}
            isFocused={focusedBitId === bit.id}
            pollingGaveUp={pollingGaveUp}
            errorMessage={rowErrors[bit.id] || null}
            selectedIds={triage.selections[bit.id]}
            onToggleVariant={triage.onToggle}
            onKeep={triage.onKeep}
            onEditingChange={onEditingChange}
            onApprove={onApprove}
            onReject={onReject}
            onUndo={onUndo}
            onGrade={onGrade}
            hideGrading={hideGrading}
            onSaveVariant={onSaveVariant}
            onSaveBit={onSaveBit}
          />
        ))}
      </ul>
    </li>
  )
}
