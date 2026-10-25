import { useCallback, useEffect, useState } from 'react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { AiLabelBadge } from './ai-label-badge'
import { KnowledgeBitReviewFlagBanner } from './knowledge-bit-review-flag-banner'
import { KnowledgeBitReviewExampleField } from './knowledge-bit-review-card-fields'
import { KnowledgeBitReviewVariantList } from './knowledge-bit-review-variant-list'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { keepIds, shownVariants } from './knowledge-bit-triage-selection'
import type { ReviewDecision } from './use-review-decisions'

export function KnowledgeBitReviewItem({
  bit,
  isResolving,
  decision = null,
  isFocused = false,
  pollingGaveUp = false,
  errorMessage = null,
  selectedIds,
  onToggleVariant,
  onKeep,
  onEditingChange,
  onApprove,
  onReject,
  onUndo,
  onGrade,
  hideGrading,
  onSaveVariant,
  onSaveBit,
}: {
  bit: PendingKnowledgeBitForReview
  isResolving: boolean
  decision?: ReviewDecision | null
  isFocused?: boolean
  pollingGaveUp?: boolean
  errorMessage?: string | null
  selectedIds?: string[]
  onToggleVariant?: (bitId: string, index: number) => void
  onKeep?: (bitId: string) => void
  onEditingChange?: (bitId: string, editing: boolean) => void
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
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set())

  const setBusy = useCallback((key: string, busy: boolean) => {
    setBusyKeys((prev) => {
      if (prev.has(key) === busy) {
        return prev
      }

      const next = new Set(prev)

      if (busy) {
        next.add(key)
      } else {
        next.delete(key)
      }

      return next
    })
  }, [])

  const hasUnsavedEdits = busyKeys.size > 0
  const hasNoVariants = bit.variants.length === 0
  const actionsDisabled = isResolving || hasUnsavedEdits
  const approveDisabled = actionsDisabled || hasNoVariants
  const kept = keepIds(bit.variants, selectedIds)
  const canTriage = bit.variants.length > 1 && onKeep !== undefined
  const excluded = shownVariants(bit.variants).length - kept.length

  useEffect(() => {
    onEditingChange?.(bit.id, hasUnsavedEdits)

    return () => onEditingChange?.(bit.id, false)
  }, [bit.id, hasUnsavedEdits, onEditingChange])

  return (
    <li
      data-testid={`knowledge-bit-review-item-${bit.id}`}
      data-focused={isFocused ? 'true' : undefined}
      data-decision={decision?.verdict}
      className={`space-y-4 rounded-xl p-4 shadow-sm transition-shadow ${
        decision ? 'bg-neutral-50' : 'bg-white'
      } ${isFocused ? 'ring-2 ring-neutral-900' : 'ring-1 ring-neutral-100'}`}
    >
      <AiLabelBadge
        isAiGenerated={bit.isAiGenerated}
        sourceLinks={bit.sourceLinks}
        testIdSuffix={`-${bit.id}`}
      />

      <KnowledgeBitReviewFlagBanner bitId={bit.id} reviewFlag={bit.reviewFlag} />

      <KnowledgeBitReviewVariantList
        bitId={bit.id}
        variants={bit.variants}
        pollingGaveUp={pollingGaveUp}
        keptIds={kept}
        pickDisabled={actionsDisabled}
        onToggle={canTriage ? (index) => onToggleVariant?.(bit.id, index) : undefined}
        onSave={(variantId, prompt, answer) => onSaveVariant(bit.id, variantId, prompt, answer)}
        onBusyChange={setBusy}
      />

      {hasNoVariants ? null : (
        <KnowledgeBitReviewExampleField
          bitId={bit.id}
          example={bit.background ?? ''}
          onSave={(example) => onSaveBit(bit.id, bit.body, example)}
          onBusyChange={(busy) => setBusy('example', busy)}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {hideGrading ? null : (
          <button
            type="button"
            data-testid={`knowledge-bit-review-grade-${bit.id}`}
            onClick={() => onGrade(bit.id)}
            className={SECONDARY_BUTTON_CLASS.replace('sm:min-h-8', 'sm:min-h-11')}
          >
            Grade this card
          </button>
        )}
        {decision ? (
          <>
            <span
              data-testid={`knowledge-bit-review-status-${bit.id}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-neutral-700 sm:min-h-8 sm:text-xs"
            >
              {decision.verdict === 'approved' ? (decision.triaged ? 'Kept' : 'Approved') : 'Rejected'}
            </span>
            {decision.triaged && !decision.droppedVariantIds?.length ? null : (
              <button
                type="button"
                data-testid={`knowledge-bit-review-undo-${bit.id}`}
                disabled={isResolving}
                onClick={() => onUndo(bit.id)}
                className={SECONDARY_BUTTON_CLASS}
              >
                Undo
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid={`knowledge-bit-review-approve-${bit.id}`}
              disabled={approveDisabled}
              onClick={() => (onKeep ? onKeep(bit.id) : onApprove(bit.id))}
              className={PRIMARY_BUTTON_CLASS}
            >
              {excluded > 0 ? `Approve ${kept.length} of ${kept.length + excluded}` : 'Approve'}
            </button>
            <button
              type="button"
              data-testid={`knowledge-bit-review-reject-${bit.id}`}
              disabled={actionsDisabled}
              onClick={() => onReject(bit.id)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Reject
            </button>
          </>
        )}
      </div>

      {errorMessage ? (
        <p
          role="alert"
          data-testid={`knowledge-bit-review-error-${bit.id}`}
          className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}
    </li>
  )
}
