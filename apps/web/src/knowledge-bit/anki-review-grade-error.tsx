import { useOnlineStatus } from '../shared/use-online-status'
import { actionErrorMessage, NON_RETRYABLE_ERRORS } from './anki-review-session-actions'
import type { useAnkiReviewSessionActions } from './anki-review-session-actions'

type Actions = ReturnType<typeof useAnkiReviewSessionActions>

const BUTTON_CLASS = 'self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white'

export function AnkiReviewGradeError({ actions }: { actions: Actions }) {
  const online = useOnlineStatus()

  if (!actions.error) {
    return null
  }

  return (
    <div role="alert" data-testid="anki-review-grade-error" className="flex flex-col gap-2">
      <p className="text-sm text-red-600">{actionErrorMessage(actions.error)}</p>
      {actions.canRetryGrade && (
        <button
          type="button"
          data-testid="anki-review-grade-retry"
          disabled={actions.busy || !online}
          onClick={() => void actions.retryGrade()}
          className={BUTTON_CLASS}
        >
          Retry
        </button>
      )}
      {actions.canRetryGrade && !online && (
        <p data-testid="anki-review-offline-hint" className="text-sm text-neutral-600">
          Waiting for the connection to come back.
        </p>
      )}
      {NON_RETRYABLE_ERRORS.has(actions.error) && (
        <button type="button" data-testid="anki-review-skip" onClick={() => void actions.advance()} className={BUTTON_CLASS}>
          Skip this card
        </button>
      )}
    </div>
  )
}
