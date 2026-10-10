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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="knowledge-bit-review-approve-all"
            onClick={onApproveAll}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
          >
            Approve all ready ({readyCount})
          </button>
          <span className="text-xs text-neutral-400">
            Keys: j/k move, a approve, r reject, Shift+A approve all from source
          </span>
        </div>
      ) : null}

      {bulkMessage ? (
        <p data-testid="knowledge-bit-review-bulk-message" className="text-xs text-neutral-600">
          {bulkMessage}
        </p>
      ) : null}
    </>
  )
}
