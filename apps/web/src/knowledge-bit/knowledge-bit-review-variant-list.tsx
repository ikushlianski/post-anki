import type { PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

import { variantKindLabel } from './knowledge-bit-variant-kind-label'

export interface VariantDraft {
  prompt: string
  answer: string
}

export function KnowledgeBitReviewVariantList({
  bitId,
  variants,
  pollingGaveUp,
  editingVariantId,
  draft,
  hasOpenEditor,
  isSavingOpenEditor,
  isSavingVariant,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
}: {
  bitId: string
  variants: PendingKnowledgeBitQuestionVariant[]
  pollingGaveUp: boolean
  editingVariantId: string | null
  draft: VariantDraft
  hasOpenEditor: boolean
  isSavingOpenEditor: boolean
  isSavingVariant: (variantId: string) => boolean
  onStartEdit: (variant: PendingKnowledgeBitQuestionVariant) => void
  onDraftChange: (patch: Partial<VariantDraft>) => void
  onSave: (variantId: string) => void
  onCancel: () => void
}) {
  return (
    <ul className="mt-2 space-y-2">
      {variants.length === 0 ? (
        <li data-testid={`knowledge-bit-review-no-variants-${bitId}`} className="text-xs text-neutral-400">
          {pollingGaveUp
            ? 'Still waiting. Reload the page to check again.'
            : 'Waiting for questions — checking automatically.'}
        </li>
      ) : null}

      {variants.map((variant) =>
        editingVariantId === variant.id ? (
          <li key={variant.id} className="rounded-md bg-neutral-50 p-2">
            <input
              data-testid={`knowledge-bit-review-edit-prompt-${variant.id}`}
              type="text"
              value={draft.prompt}
              onChange={(e) => onDraftChange({ prompt: e.target.value })}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <input
              data-testid={`knowledge-bit-review-edit-answer-${variant.id}`}
              type="text"
              value={draft.answer}
              onChange={(e) => onDraftChange({ answer: e.target.value })}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                data-testid={`knowledge-bit-review-save-${variant.id}`}
                disabled={
                  isSavingVariant(variant.id) || !draft.prompt.trim() || !draft.answer.trim()
                }
                onClick={() => onSave(variant.id)}
                className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                data-testid={`knowledge-bit-review-cancel-${variant.id}`}
                disabled={isSavingOpenEditor}
                onClick={onCancel}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </li>
        ) : (
          <li key={variant.id} data-testid={`knowledge-bit-review-variant-${variant.id}`}>
            <p
              data-testid={`knowledge-bit-review-variant-kind-${variant.id}`}
              className="text-xs uppercase text-neutral-400"
            >
              {variantKindLabel(variant.kind)}
            </p>
            <p className="text-sm">
              {variant.kind === 'basic' ? 'Front: ' : ''}
              {variant.prompt}
            </p>
            <p className="text-sm text-neutral-500">
              {variant.kind === 'basic' ? 'Back: ' : ''}
              {variant.answer}
            </p>
            <button
              type="button"
              data-testid={`knowledge-bit-review-edit-${variant.id}`}
              disabled={hasOpenEditor}
              onClick={() => onStartEdit(variant)}
              className="mt-1 text-xs text-neutral-600 underline disabled:opacity-50"
            >
              Edit
            </button>
          </li>
        ),
      )}
    </ul>
  )
}
