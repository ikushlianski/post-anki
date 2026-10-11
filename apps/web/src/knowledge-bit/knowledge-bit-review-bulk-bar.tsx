import { KnowledgeBitReviewBulkConfirm } from './knowledge-bit-review-bulk-confirm'
import { PRIMARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBitReviewBulkBar({
  readyCount,
  bulkMessage,
  isConfirming,
  onRequestApproveAll,
  onConfirmApproveAll,
  onCancelApproveAll,
}: {
  readyCount: number
  bulkMessage: string | null
  isConfirming: boolean
  onRequestApproveAll: () => void
  onConfirmApproveAll: () => void
  onCancelApproveAll: () => void
}) {
  return (
    <>
      {readyCount > 0 ? (
        isConfirming ? (
          <KnowledgeBitReviewBulkConfirm
            count={readyCount}
            confirmTestId="knowledge-bit-review-approve-all-confirm"
            cancelTestId="knowledge-bit-review-approve-all-cancel"
            onConfirm={onConfirmApproveAll}
            onCancel={onCancelApproveAll}
          />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <button
              type="button"
              data-testid="knowledge-bit-review-approve-all"
              onClick={onRequestApproveAll}
              className={PRIMARY_BUTTON_CLASS}
            >
              Approve all ready ({readyCount})
            </button>
            <span className="hidden text-xs text-neutral-600 sm:inline">
              Keys: j/k move, a approve, r reject, Shift+A approve all from source
            </span>
          </div>
        )
      ) : null}

      <p
        data-testid="knowledge-bit-review-bulk-message"
        role="status"
        aria-live="polite"
        className={`rounded-md px-3 py-2 text-xs text-neutral-600 ${
          bulkMessage ? 'border border-neutral-200 bg-white' : 'sr-only'
        }`}
      >
        {bulkMessage}
      </p>
    </>
  )
}
