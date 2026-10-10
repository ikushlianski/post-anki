import { useEffect, useState } from 'react'
import type { PendingKnowledgeBitForReview, PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

import { KnowledgeBitReviewBitStatement, type BitDraft } from './knowledge-bit-review-bit-statement'
import { KnowledgeBitReviewVariantList, type VariantDraft } from './knowledge-bit-review-variant-list'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

// Only one editor (a single variant, or the bit's own fact text) can be open
// at a time — tracked as a single value rather than separate booleans so
// opening one always closes the other, and so the disabled-while-open checks
// below have one source of truth instead of risking them drifting apart.
type OpenEditor = { type: 'variant'; variantId: string } | { type: 'bit' } | null

export function KnowledgeBitReviewItem({
  bit,
  isResolving,
  isSavingVariant,
  isSavingBit,
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
  isSavingVariant: (variantId: string) => boolean
  isSavingBit: (bitId: string) => boolean
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
  const [openEditor, setOpenEditor] = useState<OpenEditor>(null)
  const [variantDraft, setVariantDraft] = useState<VariantDraft>({ prompt: '', answer: '' })
  const [bitDraft, setBitDraft] = useState<BitDraft>({ body: '', background: '' })

  function updateBitDraft(patch: Partial<BitDraft>) {
    setBitDraft((prev) => ({ ...prev, ...patch }))
  }

  function startEditVariant(variant: PendingKnowledgeBitQuestionVariant) {
    setOpenEditor({ type: 'variant', variantId: variant.id })
    setVariantDraft({ prompt: variant.prompt, answer: variant.answer })
  }

  function updateVariantDraft(patch: Partial<VariantDraft>) {
    setVariantDraft((prev) => ({ ...prev, ...patch }))
  }

  function startEditBit() {
    setOpenEditor({ type: 'bit' })
    setBitDraft({ body: bit.body, background: bit.background ?? '' })
  }

  // Saving in flight for the currently open editor — kept open (and, below,
  // not cancellable) until that save settles, so a reviewer can never close
  // out of a pending save and approve/reject the still-unedited content
  // while the edit is racing in the background.
  const isSavingOpenEditor =
    openEditor?.type === 'variant'
      ? isSavingVariant(openEditor.variantId)
      : openEditor?.type === 'bit'
        ? isSavingBit(bit.id)
        : false

  function cancelEdit() {
    if (isSavingOpenEditor) {
      return
    }

    setOpenEditor(null)
  }

  async function saveVariantEdit(variantId: string) {
    const prompt = variantDraft.prompt.trim()
    const answer = variantDraft.answer.trim()

    if (!prompt || !answer) {
      return
    }

    const saved = await onSaveVariant(bit.id, variantId, prompt, answer)

    if (saved) {
      setOpenEditor(null)
    }
  }

  async function saveBitEdit() {
    const body = bitDraft.body.trim()
    const background = bitDraft.background.trim()

    if (!body) {
      return
    }

    const saved = await onSaveBit(bit.id, body, background.length > 0 ? background : null)

    if (saved) {
      setOpenEditor(null)
    }
  }

  // Approve/reject are blocked while any editor on this bit is open — mid-edit
  // or mid-save — so a stale (pre-edit) copy can never be approved out from
  // under an open editor. Approve is also blocked with zero live variants:
  // once approved, background generation produces fresh Q&A with no further
  // review, so approving a bit with nothing to show yet (freshly pasted, or
  // just invalidated by a body edit) would let unreviewed content reach
  // learners. Reject never needs this — rejecting with no variants is safe.
  const hasOpenEditor = openEditor !== null
  const hasNoVariants = bit.variants.length === 0
  const actionsDisabled = isResolving || hasOpenEditor
  const approveDisabled = actionsDisabled || hasNoVariants

  useEffect(() => {
    onEditingChange?.(bit.id, hasOpenEditor)

    return () => onEditingChange?.(bit.id, false)
  }, [bit.id, hasOpenEditor, onEditingChange])

  return (
    <li
      data-testid={`knowledge-bit-review-item-${bit.id}`}
      data-focused={isFocused ? 'true' : undefined}
      className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow ${
        isFocused
          ? 'border-neutral-900 ring-2 ring-neutral-900 ring-offset-2'
          : 'border-neutral-200'
      }`}
    >
      <KnowledgeBitReviewBitStatement
        bit={bit}
        isEditing={openEditor?.type === 'bit'}
        draft={bitDraft}
        canStartEdit={!hasOpenEditor}
        isSaving={isSavingBit(bit.id)}
        isSavingOpenEditor={isSavingOpenEditor}
        onStartEdit={startEditBit}
        onDraftChange={updateBitDraft}
        onSave={() => void saveBitEdit()}
        onCancel={cancelEdit}
      />

      <KnowledgeBitReviewVariantList
        bitId={bit.id}
        variants={bit.variants}
        pollingGaveUp={pollingGaveUp}
        editingVariantId={openEditor?.type === 'variant' ? openEditor.variantId : null}
        draft={variantDraft}
        hasOpenEditor={hasOpenEditor}
        isSavingOpenEditor={isSavingOpenEditor}
        isSavingVariant={isSavingVariant}
        onStartEdit={startEditVariant}
        onDraftChange={updateVariantDraft}
        onSave={saveVariantEdit}
        onCancel={cancelEdit}
      />

      <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-3 sm:flex-row sm:justify-end">
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
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}
    </li>
  )
}
