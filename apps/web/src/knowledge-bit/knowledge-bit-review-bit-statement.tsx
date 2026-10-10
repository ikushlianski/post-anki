import { useId } from 'react'
import { Pencil } from 'lucide-react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_BUTTON_CLASS, TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'

export interface BitDraft {
  body: string
  background: string
}

export function KnowledgeBitReviewBitStatement({
  bit,
  isEditing,
  draft,
  canStartEdit,
  isSaving,
  isSavingOpenEditor,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
}: {
  bit: PendingKnowledgeBitForReview
  isEditing: boolean
  draft: BitDraft
  canStartEdit: boolean
  isSaving: boolean
  isSavingOpenEditor: boolean
  onStartEdit: () => void
  onDraftChange: (patch: Partial<BitDraft>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const bodyId = useId()
  const backgroundId = useId()

  if (isEditing) {
    return (
      <div data-testid={`knowledge-bit-review-edit-bit-${bit.id}`} className="space-y-3 rounded-lg bg-neutral-50 p-3">
        <div className="space-y-1">
          <label htmlFor={bodyId} className="text-xs font-medium text-neutral-600">
            Statement
          </label>
          <textarea
            id={bodyId}
            data-testid={`knowledge-bit-review-edit-body-${bit.id}`}
            value={draft.body}
            onChange={(e) => onDraftChange({ body: e.target.value })}
            className={`${TEXT_FIELD_CLASS} min-h-20`}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={backgroundId} className="text-xs font-medium text-neutral-600">
            Background note
          </label>
          <textarea
            id={backgroundId}
            data-testid={`knowledge-bit-review-edit-background-${bit.id}`}
            value={draft.background}
            onChange={(e) => onDraftChange({ background: e.target.value })}
            placeholder="Background (optional)"
            className={`${TEXT_FIELD_CLASS} min-h-16`}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            data-testid={`knowledge-bit-review-save-bit-${bit.id}`}
            disabled={isSaving || !draft.body.trim()}
            onClick={onSave}
            className={PRIMARY_BUTTON_CLASS}
          >
            Save
          </button>
          <button
            type="button"
            data-testid={`knowledge-bit-review-cancel-bit-${bit.id}`}
            disabled={isSavingOpenEditor}
            onClick={onCancel}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <p
          data-testid={`knowledge-bit-review-body-${bit.id}`}
          className="min-w-0 break-words text-base font-semibold leading-snug text-neutral-900"
        >
          {bit.body}
        </p>
        <button
          type="button"
          data-testid={`knowledge-bit-review-edit-bit-button-${bit.id}`}
          aria-label="Edit statement"
          disabled={!canStartEdit}
          onClick={onStartEdit}
          className={`${TEXT_BUTTON_CLASS} shrink-0`}
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          Edit
        </button>
      </div>
      {bit.background ? (
        <p
          data-testid={`knowledge-bit-review-background-${bit.id}`}
          className="break-words text-sm text-neutral-500"
        >
          {bit.background}
        </p>
      ) : null}
    </div>
  )
}
