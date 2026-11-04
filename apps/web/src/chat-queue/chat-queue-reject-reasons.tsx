import { useState } from 'react'
import {
  KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS,
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS,
  type KnowledgeBitRejectReason,
} from '@post-anki/shared'

import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_FIELD_CLASS,
} from '../knowledge-bit/knowledge-bit-review-classes'

interface Props {
  reasonCodes?: readonly KnowledgeBitRejectReason[] | undefined
  onSend: (reason: KnowledgeBitRejectReason, note: string) => Promise<void>
  onSkip: () => void
}

export function ChatQueueRejectReasons({ reasonCodes = KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS, onSend, onSkip }: Props) {
  const [reason, setReason] = useState<KnowledgeBitRejectReason | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function send() {
    if (!reason) {
      return
    }

    setSaving(true)
    await onSend(reason, note)
    setSaving(false)
  }

  return (
    <section data-testid="chat-queue-reject-reasons" className="space-y-3">
      <p className="text-sm font-medium">Rejected. Why?</p>
      <div className="flex flex-wrap gap-2">
        {reasonCodes.map((code) => (
          <button
            key={code}
            type="button"
            data-testid={`chat-queue-reason-${code}`}
            aria-pressed={reason === code}
            onClick={() => setReason(code)}
            className={`min-h-11 rounded-full px-3 text-xs font-medium sm:min-h-9 ${
              reason === code
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {KNOWLEDGE_BIT_REJECT_REASON_LABELS[code]}
          </button>
        ))}
      </div>
      <input
        type="text"
        aria-label="Optional note about this decision"
        placeholder="Optional note"
        value={note}
        maxLength={KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS}
        onChange={(event) => setNote(event.target.value)}
        className={TEXT_FIELD_CLASS}
      />
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="chat-queue-reason-send"
          disabled={!reason || saving}
          onClick={() => void send()}
          className={PRIMARY_BUTTON_CLASS}
        >
          Send
        </button>
        <button
          type="button"
          data-testid="chat-queue-reason-skip"
          disabled={saving}
          onClick={onSkip}
          className={SECONDARY_BUTTON_CLASS}
        >
          Skip
        </button>
      </div>
    </section>
  )
}
