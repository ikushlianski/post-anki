import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export function KnowledgeBitReviewBulkConfirm({
  count,
  confirmTestId,
  cancelTestId,
  onConfirm,
  onCancel,
}: {
  count: number
  confirmTestId: string
  cancelTestId: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <p className="text-sm font-medium text-neutral-900">
        {`Approve ${count} ${count === 1 ? 'item' : 'items'}?`}
      </p>
      <div className="flex gap-2">
        <button type="button" data-testid={confirmTestId} onClick={onConfirm} className={PRIMARY_BUTTON_CLASS}>
          Confirm
        </button>
        <button type="button" data-testid={cancelTestId} onClick={onCancel} className={SECONDARY_BUTTON_CLASS}>
          Cancel
        </button>
      </div>
    </div>
  )
}
