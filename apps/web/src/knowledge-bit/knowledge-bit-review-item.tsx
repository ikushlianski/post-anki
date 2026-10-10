import { useEffect, useState } from 'react'
import type { PendingKnowledgeBitForReview, PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

interface VariantDraft {
  prompt: string
  answer: string
}

interface BitDraft {
  body: string
  background: string
}

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

  function startEditVariant(variant: PendingKnowledgeBitQuestionVariant) {
    setOpenEditor({ type: 'variant', variantId: variant.id })
    setVariantDraft({ prompt: variant.prompt, answer: variant.answer })
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
      className={`rounded-lg border bg-white p-3 ${
        isFocused ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'
      }`}
    >
      {openEditor?.type === 'bit' ? (
        <div data-testid={`knowledge-bit-review-edit-bit-${bit.id}`}>
          <textarea
            data-testid={`knowledge-bit-review-edit-body-${bit.id}`}
            value={bitDraft.body}
            onChange={(e) => setBitDraft((prev) => ({ ...prev, body: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <textarea
            data-testid={`knowledge-bit-review-edit-background-${bit.id}`}
            value={bitDraft.background}
            onChange={(e) => setBitDraft((prev) => ({ ...prev, background: e.target.value }))}
            placeholder="Background (optional)"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              data-testid={`knowledge-bit-review-save-bit-${bit.id}`}
              disabled={isSavingBit(bit.id) || !bitDraft.body.trim()}
              onClick={() => saveBitEdit()}
              className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              data-testid={`knowledge-bit-review-cancel-bit-${bit.id}`}
              disabled={isSavingOpenEditor}
              onClick={cancelEdit}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p data-testid={`knowledge-bit-review-body-${bit.id}`} className="text-sm font-medium">
            {bit.body}
          </p>
          {bit.background ? (
            <p
              data-testid={`knowledge-bit-review-background-${bit.id}`}
              className="mt-1 text-xs text-neutral-600"
            >
              {bit.background}
            </p>
          ) : null}
          <button
            type="button"
            data-testid={`knowledge-bit-review-edit-bit-button-${bit.id}`}
            disabled={hasOpenEditor}
            onClick={startEditBit}
            className="mt-1 text-xs text-neutral-600 underline disabled:opacity-50"
          >
            Edit text
          </button>
        </>
      )}

      <ul className="mt-2 space-y-2">
        {bit.variants.length === 0 ? (
          <li data-testid={`knowledge-bit-review-no-variants-${bit.id}`} className="text-xs text-neutral-400">
            Waiting for questions — checking automatically.
          </li>
        ) : null}

        {bit.variants.map((variant) =>
          openEditor?.type === 'variant' && openEditor.variantId === variant.id ? (
            <li key={variant.id} className="rounded-md bg-neutral-50 p-2">
              <input
                data-testid={`knowledge-bit-review-edit-prompt-${variant.id}`}
                type="text"
                value={variantDraft.prompt}
                onChange={(e) => setVariantDraft((prev) => ({ ...prev, prompt: e.target.value }))}
                className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                data-testid={`knowledge-bit-review-edit-answer-${variant.id}`}
                type="text"
                value={variantDraft.answer}
                onChange={(e) => setVariantDraft((prev) => ({ ...prev, answer: e.target.value }))}
                className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  data-testid={`knowledge-bit-review-save-${variant.id}`}
                  disabled={
                    isSavingVariant(variant.id) ||
                    !variantDraft.prompt.trim() ||
                    !variantDraft.answer.trim()
                  }
                  onClick={() => saveVariantEdit(variant.id)}
                  className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  data-testid={`knowledge-bit-review-cancel-${variant.id}`}
                  disabled={isSavingOpenEditor}
                  onClick={cancelEdit}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={variant.id} data-testid={`knowledge-bit-review-variant-${variant.id}`}>
              <p className="text-sm">{variant.prompt}</p>
              <p className="text-sm text-neutral-500">{variant.answer}</p>
              <button
                type="button"
                data-testid={`knowledge-bit-review-edit-${variant.id}`}
                disabled={hasOpenEditor}
                onClick={() => startEditVariant(variant)}
                className="mt-1 text-xs text-neutral-600 underline disabled:opacity-50"
              >
                Edit
              </button>
            </li>
          ),
        )}
      </ul>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid={`knowledge-bit-review-approve-${bit.id}`}
          disabled={approveDisabled}
          onClick={() => onApprove(bit.id)}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          data-testid={`knowledge-bit-review-reject-${bit.id}`}
          disabled={actionsDisabled}
          onClick={() => onReject(bit.id)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  )
}
