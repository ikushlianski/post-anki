import { useId } from 'react'
import type { PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'
import type { VariantDraft } from './knowledge-bit-review-variant-list'

export function KnowledgeBitReviewVariantEditor({
  variant,
  draft,
  isSaving,
  isSavingOpenEditor,
  onDraftChange,
  onSave,
  onCancel,
}: {
  variant: PendingKnowledgeBitQuestionVariant
  draft: VariantDraft
  isSaving: boolean
  isSavingOpenEditor: boolean
  onDraftChange: (patch: Partial<VariantDraft>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const promptId = useId()
  const answerId = useId()

  return (
    <li className="space-y-3 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
      <div className="space-y-1">
        <label htmlFor={promptId} className="text-xs font-medium text-neutral-600">
          Front
        </label>
        <input
          id={promptId}
          data-testid={`knowledge-bit-review-edit-prompt-${variant.id}`}
          type="text"
          value={draft.prompt}
          onChange={(e) => onDraftChange({ prompt: e.target.value })}
          className={TEXT_FIELD_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={answerId} className="text-xs font-medium text-neutral-600">
          Back
        </label>
        <input
          id={answerId}
          data-testid={`knowledge-bit-review-edit-answer-${variant.id}`}
          type="text"
          value={draft.answer}
          onChange={(e) => onDraftChange({ answer: e.target.value })}
          className={TEXT_FIELD_CLASS}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          data-testid={`knowledge-bit-review-save-${variant.id}`}
          disabled={isSaving || !draft.prompt.trim() || !draft.answer.trim()}
          onClick={onSave}
          className={PRIMARY_BUTTON_CLASS}
        >
          Save
        </button>
        <button
          type="button"
          data-testid={`knowledge-bit-review-cancel-${variant.id}`}
          disabled={isSavingOpenEditor}
          onClick={onCancel}
          className={SECONDARY_BUTTON_CLASS}
        >
          Cancel
        </button>
      </div>
    </li>
  )
}
