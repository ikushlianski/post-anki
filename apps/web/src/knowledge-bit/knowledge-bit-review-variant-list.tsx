import { Pencil } from 'lucide-react'
import type { PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

import { KnowledgeBitReviewVariantEditor } from './knowledge-bit-review-variant-editor'
import { TEXT_BUTTON_CLASS } from './knowledge-bit-review-classes'
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
    <ul className="mt-4 space-y-3">
      {variants.length === 0 ? (
        <li
          data-testid={`knowledge-bit-review-no-variants-${bitId}`}
          className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-500"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-pulse rounded-full bg-neutral-400 motion-reduce:animate-none"
          />
          {pollingGaveUp
            ? 'Still waiting. Reload the page to check again.'
            : 'Writing cards…'}
        </li>
      ) : null}

      {variants.map((variant) =>
        editingVariantId === variant.id ? (
          <KnowledgeBitReviewVariantEditor
            key={variant.id}
            variant={variant}
            draft={draft}
            isSaving={isSavingVariant(variant.id)}
            isSavingOpenEditor={isSavingOpenEditor}
            onDraftChange={onDraftChange}
            onSave={() => onSave(variant.id)}
            onCancel={onCancel}
          />
        ) : (
          <li
            key={variant.id}
            data-testid={`knowledge-bit-review-variant-${variant.id}`}
            className="rounded-lg border border-neutral-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                data-testid={`knowledge-bit-review-variant-kind-${variant.id}`}
                className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-600"
              >
                {variantKindLabel(variant.kind)}
              </span>
              <button
                type="button"
                data-testid={`knowledge-bit-review-edit-${variant.id}`}
                aria-label="Edit card"
                disabled={hasOpenEditor}
                onClick={() => onStartEdit(variant)}
                className={TEXT_BUTTON_CLASS}
              >
                <Pencil aria-hidden="true" className="size-3.5" />
                Edit
              </button>
            </div>

            <p className="mt-3 break-words text-sm font-semibold text-neutral-900">
              {variant.kind === 'basic' ? (
                <span className="font-normal text-neutral-500">Front: </span>
              ) : null}
              {variant.prompt}
            </p>

            <div className="mt-2 rounded-md border-l-2 border-neutral-300 bg-neutral-50 px-3 py-2">
              <p className="break-words text-sm text-neutral-700">
                {variant.kind === 'basic' ? (
                  <span className="text-neutral-500">Back: </span>
                ) : null}
                {variant.answer}
              </p>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
