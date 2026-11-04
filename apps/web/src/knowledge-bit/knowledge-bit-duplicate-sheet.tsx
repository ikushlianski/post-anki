import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { SimilarCard } from './duplicate-similar-cards'
import { useVerticalDrag } from './knowledge-bit-focus-drag'

interface KnowledgeBitDuplicateSheetProps {
  card: SimilarCard
  busy: boolean
  acceptDisabled: boolean
  errorMessage: string | null
  onClose: () => void
  onReject: () => void
  onAccept: () => void
}

export function KnowledgeBitDuplicateSheet({
  card,
  busy,
  acceptDisabled,
  errorMessage,
  onClose,
  onReject,
  onAccept,
}: KnowledgeBitDuplicateSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const drag = useVerticalDrag({
    enabled: true,
    onDrag: (direction) => {
      if (direction === 'down') {
        onClose()
      }
    },
  })
  const closeRequest = useRef(onClose)

  closeRequest.current = onClose

  useEffect(() => {
    const opener = document.activeElement

    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeRequest.current()
      }

      event.stopPropagation()
    }

    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)

      if (opener instanceof HTMLElement) {
        opener.focus()
      }
    }
  }, [])

  return createPortal(
    <div
      data-testid="knowledge-bit-duplicate-backdrop"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Similar card preview"
        data-testid="knowledge-bit-duplicate-sheet"
        {...drag}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
      >
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-neutral-300" />
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {card.subject ?? 'No subject'}
          </p>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="min-h-11 min-w-11 text-sm text-neutral-600 hover:text-neutral-900 sm:min-h-8 sm:min-w-8"
          >
            Close
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500">Front</p>
          <p data-testid="knowledge-bit-duplicate-front" className="whitespace-pre-wrap text-sm text-neutral-900">
            {card.front}
          </p>
          <p className="text-xs font-medium text-neutral-500">Back</p>
          <p data-testid="knowledge-bit-duplicate-back" className="whitespace-pre-wrap text-sm text-neutral-900">
            {card.back ?? '-'}
          </p>
        </div>
        {errorMessage ? (
          <p role="alert" data-testid="knowledge-bit-duplicate-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Reject duplicate"
            disabled={busy}
            onClick={onReject}
            className="min-h-11 flex-1 rounded-md border border-red-300 px-3 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            Reject duplicate
          </button>
          <button
            type="button"
            aria-label="Accept"
            disabled={busy || acceptDisabled}
            onClick={onAccept}
            className="min-h-11 flex-1 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Accept
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
