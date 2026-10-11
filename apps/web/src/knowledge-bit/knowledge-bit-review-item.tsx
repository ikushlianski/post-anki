import { useCallback, useEffect, useState } from 'react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { KnowledgeBitReviewExampleField } from './knowledge-bit-review-card-fields'
import { KnowledgeBitReviewVariantList } from './knowledge-bit-review-variant-list'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBitReviewItem({
  bit,
  isResolving,
  isFocused = false,
  pollingGaveUp = false,
  errorMessage = null,
  onEditingChange,
  onApprove,
  onReject,
  onSaveVariant,
  onSaveBit,
}: {
  bit: PendingKnowledgeBitForReview
  isResolving: boolean
  isSavingVariant?: (variantId: string) => boolean
  isSavingBit?: (bitId: string) => boolean
  isFocused?: boolean
  pollingGaveUp?: boolean
  errorMessage?: string | null
  onEditingChange?: (bitId: string, editing: boolean) => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
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

  useEffect(() => {
    onEditingChange?.(bit.id, hasUnsavedEdits)

    return () => onEditingChange?.(bit.id, false)
  }, [bit.id, hasUnsavedEdits, onEditingChange])

  return (
    <li
      data-testid={`knowledge-bit-review-item-${bit.id}`}
      data-focused={isFocused ? 'true' : undefined}
      className={`space-y-4 rounded-xl bg-white p-4 shadow-sm transition-shadow ${
        isFocused ? 'ring-2 ring-neutral-900' : 'ring-1 ring-neutral-100'
      }`}
    >
      <KnowledgeBitReviewVariantList
        bitId={bit.id}
        variants={bit.variants}
        pollingGaveUp={pollingGaveUp}
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
        <button
          type="button"
          data-testid={`knowledge-bit-review-approve-${bit.id}`}
          disabled={approveDisabled}
          onClick={() => onApprove(bit.id)}
          className={PRIMARY_BUTTON_CLASS}
        >
          Approve
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
