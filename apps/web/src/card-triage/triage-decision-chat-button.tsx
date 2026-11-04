import { useState } from 'react'
import type { TriageDecision } from '@post-anki/shared'

import { SECONDARY_BUTTON_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'

export function canSendDecisionToChat(decision: TriageDecision): boolean {
  return decision.verdict === 'rejected'
}

export function TriageDecisionChatButton({
  bitId,
  disabled,
  onSendToChat,
}: {
  bitId: string
  disabled: boolean
  onSendToChat: (bitId: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [inChat, setInChat] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)

    const ok = await onSendToChat(bitId)

    setBusy(false)

    if (ok) {
      setInChat(true)
    } else {
      setError("Couldn't send to Chat. Try again.")
    }
  }

  if (inChat) {
    return (
      <p data-testid={`triage-decision-in-chat-${bitId}`} className="text-sm text-neutral-600">
        Sent to Chat
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        data-testid={`triage-decision-send-chat-${bitId}`}
        disabled={disabled || busy}
        onClick={() => void send()}
        className={SECONDARY_BUTTON_CLASS}
      >
        Send to Chat
      </button>
      {error ? (
        <p role="alert" data-testid={`triage-decision-chat-error-${bitId}`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
