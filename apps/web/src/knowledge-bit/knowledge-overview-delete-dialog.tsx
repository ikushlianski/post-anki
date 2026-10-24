import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export interface KnowledgeOverviewDeleteDialogProps {
  count: number
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function KnowledgeOverviewDeleteDialog({
  count,
  busy,
  error,
  onConfirm,
  onCancel,
}: KnowledgeOverviewDeleteDialogProps) {
  const deleteRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const title = `Delete ${count} ${count === 1 ? 'card' : 'cards'} permanently?`

  useEffect(() => {
    deleteRef.current?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.preventDefault()

      if (!event.repeat && !busy) {
        onCancel()
      }

      return
    }

    if (event.key === 'Enter' && event.repeat) {
      event.preventDefault()

      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const first = cancelRef.current
    const last = deleteRef.current

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="knowledge-overview-delete-title"
        aria-describedby="knowledge-overview-delete-description"
        data-testid="knowledge-overview-delete-dialog"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id="knowledge-overview-delete-title" className="text-lg font-semibold text-neutral-900">
          {title}
        </h2>
        <p id="knowledge-overview-delete-description" className="mt-2 text-sm text-neutral-600">
          Their questions, schedule, review history and tags are removed. This cannot be undone.
        </p>
        {error ? (
          <p role="alert" data-testid="knowledge-overview-delete-error" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-testid="knowledge-overview-delete-cancel"
            onClick={() => !busy && onCancel()}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            ref={deleteRef}
            type="button"
            aria-disabled={busy}
            data-testid="knowledge-overview-delete-confirm"
            onClick={() => !busy && onConfirm()}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
