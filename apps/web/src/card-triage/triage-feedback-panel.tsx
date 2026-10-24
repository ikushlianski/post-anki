import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { TRIAGE_FEEDBACK_MAX_CHARS, type TriageSessionResponse } from '@post-anki/shared'

import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_FIELD_CLASS,
} from '../knowledge-bit/knowledge-bit-review-classes'

export function TriageFeedbackPanel({
  decidedCount,
  saving,
  error,
  resumed,
  stale,
  onDiscard,
  onSave,
  onSkip,
}: {
  decidedCount: number
  saving: boolean
  error: string | null
  resumed: boolean
  stale: boolean
  onDiscard: () => void
  onSave: (text: string) => void
  onSkip: () => void
}) {
  const [text, setText] = useState('')

  return (
    <section
      data-testid="triage-feedback-panel"
      aria-label="Triage feedback"
      className="space-y-3 rounded-md border border-neutral-200 bg-white p-4"
    >
      <h2 className="text-base font-semibold">How did these cards look?</h2>
      <p data-testid="triage-feedback-count" className="text-sm text-neutral-600">
        This session covers {decidedCount} {decidedCount === 1 ? 'card' : 'cards'}. Type, paste or
        dictate what you liked and what you did not.
      </p>
      {resumed ? (
        <p data-testid="triage-feedback-resumed" className="text-sm text-neutral-600">
          This session was open before the page reloaded. Decisions made before the reload are
          still counted.
        </p>
      ) : null}
      <textarea
        data-testid="triage-feedback-text"
        aria-label="Feedback"
        rows={6}
        maxLength={TRIAGE_FEEDBACK_MAX_CHARS}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className={TEXT_FIELD_CLASS}
      />
      {error ? (
        <p role="alert" data-testid="triage-feedback-error" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {stale ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-700">This session no longer exists or is already finished.</p>
          <button
            type="button"
            data-testid="triage-feedback-discard"
            onClick={onDiscard}
            className={SECONDARY_BUTTON_CLASS}
          >
            Discard this session
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="triage-feedback-save"
          disabled={saving}
          onClick={() => onSave(text)}
          className={PRIMARY_BUTTON_CLASS}
        >
          Save
        </button>
        <button
          type="button"
          data-testid="triage-feedback-skip"
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

export function TriageResultPanel({
  result,
  onClose,
}: {
  result: TriageSessionResponse
  onClose: () => void
}) {
  return (
    <section
      data-testid="triage-result"
      aria-label="Triage result"
      className="space-y-3 rounded-md border border-neutral-200 bg-white p-4"
    >
      <h2 className="text-base font-semibold">Triage saved</h2>
      <p className="text-sm text-neutral-600">
        {result.acceptedCount} accepted, {result.rejectedCount} rejected.
      </p>
      {result.notes.length > 0 ? (
        <ul data-testid="triage-result-notes" className="list-disc space-y-1 pl-5 text-sm">
          {result.notes.map((note) => (
            <li key={note.id}>{note.text}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-600">No new style notes came out of this session.</p>
      )}
      <div className="flex items-center gap-3">
        <Link to="/knowledge/style-notes" className="text-sm underline">
          Edit style notes
        </Link>
        <button
          type="button"
          data-testid="triage-result-close"
          onClick={onClose}
          className={SECONDARY_BUTTON_CLASS}
        >
          Done
        </button>
      </div>
    </section>
  )
}
