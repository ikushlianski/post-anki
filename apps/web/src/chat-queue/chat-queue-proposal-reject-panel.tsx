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
  index: number
  disabled: boolean
  onSend: (feedback: string) => void
  onDiscard: () => void
  onCancel: () => void
}

export function proposalFeedbackText(reason: KnowledgeBitRejectReason | null, note: string): string {
  const label = reason ? KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason] : ''
  const trimmed = note.trim()

  return [label, trimmed].filter((part) => part.length > 0).join(': ')
}

export function ChatQueueProposalRejectPanel({ index, disabled, onSend, onDiscard, onCancel }: Props) {
  const [reason, setReason] = useState<KnowledgeBitRejectReason | null>(null)
  const [note, setNote] = useState('')
  const feedback = proposalFeedbackText(reason, note)

  return (
    <div data-testid={`chat-queue-proposal-reject-panel-${index}`} className="space-y-2">
      <p className="text-sm font-medium">What is wrong with it?</p>
      <div className="flex flex-wrap gap-2">
        {KNOWLEDGE_BIT_SELECTABLE_REJECT_REASONS.map((code) => (
          <button
            key={code}
            type="button"
            data-testid={`chat-queue-proposal-reason-${index}-${code}`}
            aria-pressed={reason === code}
            onClick={() => setReason(reason === code ? null : code)}
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
        aria-label="What is wrong with this card"
        placeholder="Tell the tutor what to fix"
        value={note}
        maxLength={KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS}
        onChange={(event) => setNote(event.target.value)}
        className={TEXT_FIELD_CLASS}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid={`chat-queue-proposal-reject-send-${index}`}
          disabled={disabled || feedback.length === 0}
          onClick={() => onSend(feedback)}
          className={PRIMARY_BUTTON_CLASS}
        >
          Send
        </button>
        <button
          type="button"
          data-testid={`chat-queue-proposal-discard-${index}`}
          disabled={disabled}
          onClick={onDiscard}
          className={SECONDARY_BUTTON_CLASS}
        >
          Discard card
        </button>
        <button
          type="button"
          data-testid={`chat-queue-proposal-reject-cancel-${index}`}
          disabled={disabled}
          onClick={onCancel}
          className={SECONDARY_BUTTON_CLASS}
        >
          Back
        </button>
      </div>
    </div>
  )
}
