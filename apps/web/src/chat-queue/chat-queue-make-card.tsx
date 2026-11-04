import { MANUAL_ITEM_BACK_MAX_CHARS, MANUAL_ITEM_FRONT_MAX_CHARS } from '@post-anki/shared'

import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_FIELD_CLASS,
} from '../knowledge-bit/knowledge-bit-review-classes'
import type { CardDraft } from './use-chat-card'

interface Props {
  draft: CardDraft
  saving: boolean
  error: string | null
  onEdit: (patch: Partial<Pick<CardDraft, 'front' | 'back'>>) => void
  onSave: () => void
  onCancel: () => void
}

export function ChatQueueMakeCard({ draft, saving, error, onEdit, onSave, onCancel }: Props) {
  const canSave = !saving && draft.front.trim().length > 0 && draft.back.trim().length > 0

  return (
    <form
      data-testid="chat-queue-make-card-form"
      className="mt-2 space-y-2 rounded-lg border border-neutral-200 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <label className="block text-xs text-neutral-500">
        Front (question)
        <textarea
          aria-label="Card front"
          rows={2}
          maxLength={MANUAL_ITEM_FRONT_MAX_CHARS}
          value={draft.front}
          onChange={(event) => onEdit({ front: event.target.value })}
          className={TEXT_FIELD_CLASS}
        />
      </label>
      <label className="block text-xs text-neutral-500">
        Back (answer)
        <textarea
          aria-label="Card back"
          rows={4}
          maxLength={MANUAL_ITEM_BACK_MAX_CHARS}
          value={draft.back}
          onChange={(event) => onEdit({ back: event.target.value })}
          className={TEXT_FIELD_CLASS}
        />
      </label>
      {error ? (
        <p role="alert" data-testid="chat-queue-make-card-error" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="chat-queue-make-card-save"
          disabled={!canSave}
          className={PRIMARY_BUTTON_CLASS}
        >
          Save card
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className={SECONDARY_BUTTON_CLASS}>
          Cancel
        </button>
      </div>
    </form>
  )
}
