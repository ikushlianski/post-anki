import { useState } from 'react'
import {
  MANUAL_ITEM_BACK_MAX_CHARS,
  MANUAL_ITEM_EXAMPLE_MAX_CHARS,
  MANUAL_ITEM_FRONT_MAX_CHARS,
  type CardProposal,
} from '@post-anki/shared'

const FIELD_CLASS = 'min-h-16 w-full rounded-md border border-neutral-300 p-2 text-sm'
const BUTTON_CLASS = 'min-h-11 rounded-md px-4 text-sm font-medium disabled:opacity-50'

export interface EditedCardFields {
  front: string
  back: string
  example: string
}

export function KnowledgeBitChatCardEditor({
  card,
  saving,
  onSave,
  onCancel,
}: {
  card: CardProposal
  saving: boolean
  onSave: (fields: EditedCardFields) => void
  onCancel: () => void
}) {
  const [fields, setFields] = useState<EditedCardFields>({
    front: card.front,
    back: card.back,
    example: card.example ?? '',
  })
  const canSave = fields.front.trim() !== '' && fields.back.trim() !== ''

  return (
    <div data-testid="knowledge-bit-chat-card-editor" className="space-y-2">
      <textarea
        aria-label="Card front"
        data-testid="knowledge-bit-chat-card-edit-front"
        maxLength={MANUAL_ITEM_FRONT_MAX_CHARS}
        value={fields.front}
        disabled={saving}
        onChange={(event) => setFields({ ...fields, front: event.target.value })}
        className={FIELD_CLASS}
      />
      <textarea
        aria-label="Card back"
        data-testid="knowledge-bit-chat-card-edit-back"
        maxLength={MANUAL_ITEM_BACK_MAX_CHARS}
        value={fields.back}
        disabled={saving}
        onChange={(event) => setFields({ ...fields, back: event.target.value })}
        className={`${FIELD_CLASS} min-h-20`}
      />
      <textarea
        aria-label="Card example"
        data-testid="knowledge-bit-chat-card-edit-example"
        maxLength={MANUAL_ITEM_EXAMPLE_MAX_CHARS}
        value={fields.example}
        disabled={saving}
        onChange={(event) => setFields({ ...fields, example: event.target.value })}
        className={FIELD_CLASS}
      />
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="knowledge-bit-chat-card-edit-save"
          disabled={saving || !canSave}
          onClick={() => onSave(fields)}
          className={`${BUTTON_CLASS} bg-neutral-900 text-white`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          data-testid="knowledge-bit-chat-card-edit-cancel"
          disabled={saving}
          onClick={onCancel}
          className={`${BUTTON_CLASS} border border-neutral-300 text-neutral-700`}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
