import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { SearchableSelect, type SearchableOption } from '../ui/searchable-select'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export interface KnowledgeOverviewMoveDialogProps {
  count: number
  subjectOptions: SearchableOption[]
  busy: boolean
  error: string | null
  onConfirm: (subjectId: string) => void
  onCancel: () => void
}

export function KnowledgeOverviewMoveDialog({
  count,
  subjectOptions,
  busy,
  error,
  onConfirm,
  onCancel,
}: KnowledgeOverviewMoveDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [subjectId, setSubjectId] = useState('')
  const title = `Move ${count} ${count === 1 ? 'card' : 'cards'} to a subject?`

  useEffect(() => {
    confirmRef.current?.focus()
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

    if (event.key !== 'Tab') {
      return
    }

    const first = cancelRef.current
    const last = confirmRef.current

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
        aria-labelledby="knowledge-overview-move-title"
        data-testid="knowledge-overview-move-dialog"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id="knowledge-overview-move-title" className="text-lg font-semibold text-neutral-900">
          {title}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Standalone cards move to the chosen subject. Cards inside a curriculum keep their curriculum&apos;s
          subject.
        </p>
        <div className="mt-4">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Subject</span>
          <SearchableSelect
            ariaLabel="Subject"
            testId="knowledge-overview-move-subject"
            options={subjectOptions}
            value={subjectId}
            onChange={setSubjectId}
            placeholder="Choose a subject…"
          />
        </div>
        {error ? (
          <p role="alert" data-testid="knowledge-overview-move-error" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-testid="knowledge-overview-move-cancel"
            onClick={() => !busy && onCancel()}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            aria-disabled={busy || !subjectId}
            data-testid="knowledge-overview-move-confirm"
            onClick={() => !busy && subjectId && onConfirm(subjectId)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}
