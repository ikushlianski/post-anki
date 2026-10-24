import { TRIAGE_FEEDBACK_MAX_CHARS } from '@post-anki/shared'

import { PRIMARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBitFocusDone({
  waitingCount,
  decidedCount,
  feedback = '',
  onFeedbackChange,
  onFinish,
}: {
  waitingCount: number
  decidedCount: number
  feedback?: string
  onFeedbackChange?: (text: string) => void
  onFinish: () => void
}) {
  const isWaiting = waitingCount > 0

  return (
    <div
      data-testid="knowledge-bit-focus-done"
      className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center"
    >
      <h2 className="text-lg font-semibold text-neutral-900">
        {isWaiting ? 'Writing more cards…' : 'All cards decided'}
      </h2>
      <p className="text-sm text-neutral-600">
        {isWaiting
          ? `${waitingCount} ${waitingCount === 1 ? 'suggestion is' : 'suggestions are'} still being written. They will show up here when ready, or you can finish now.`
          : decidedCount > 0
            ? `You went through ${decidedCount} ${decidedCount === 1 ? 'card' : 'cards'}. Finish to wrap up this session.`
            : 'There is nothing left to review. Finish to wrap up this session.'}
      </p>
      <button
        type="button"
        data-testid="knowledge-bit-focus-done-finish"
        onClick={onFinish}
        className={`${PRIMARY_BUTTON_CLASS} sm:min-h-11 sm:px-4 sm:text-sm`}
      >
        Finish triage
      </button>
      {onFeedbackChange ? (
        <label className="mt-2 block w-full space-y-1 text-left text-sm text-neutral-700">
          <span className="text-xs font-medium text-neutral-600">Feedback (optional)</span>
          <textarea
            data-testid="knowledge-bit-focus-done-feedback"
            rows={4}
            maxLength={TRIAGE_FEEDBACK_MAX_CHARS}
            value={feedback}
            placeholder="What did you like or not like about these cards? Helps future cards."
            onChange={(event) => onFeedbackChange(event.target.value)}
            className={TEXT_FIELD_CLASS}
          />
        </label>
      ) : null}
    </div>
  )
}
