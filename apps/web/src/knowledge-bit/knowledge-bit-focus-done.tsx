import { PRIMARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBitFocusDone({
  waitingCount,
  decidedCount,
  onFinish,
}: {
  waitingCount: number
  decidedCount: number
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
    </div>
  )
}
