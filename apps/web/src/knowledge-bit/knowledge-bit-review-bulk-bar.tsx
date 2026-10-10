import { PRIMARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBitReviewBulkBar({
  readyCount,
  bulkMessage,
  onApproveAll,
}: {
  readyCount: number
  bulkMessage: string | null
  onApproveAll: () => void
}) {
  return (
    <>
      {readyCount > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <button
            type="button"
            data-testid="knowledge-bit-review-approve-all"
            onClick={onApproveAll}
            className={PRIMARY_BUTTON_CLASS}
          >
            Approve all ready ({readyCount})
          </button>
          <span className="hidden text-xs text-neutral-400 sm:inline">
            Keys: j/k move, a approve, r reject, Shift+A approve all from source
          </span>
        </div>
      ) : null}

      {bulkMessage ? (
        <p
          data-testid="knowledge-bit-review-bulk-message"
          role="status"
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600"
        >
          {bulkMessage}
        </p>
      ) : null}
    </>
  )
}
