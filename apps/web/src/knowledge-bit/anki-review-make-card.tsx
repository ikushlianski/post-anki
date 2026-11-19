import { useRef, useState, type RefObject } from 'react'
import { MANUAL_ITEM_BACK_MAX_CHARS, MANUAL_ITEM_FRONT_MAX_CHARS } from '@post-anki/shared'

import { useOnlineStatus } from '../shared/use-online-status'
import { useCardSelection } from '../subject-chat/use-card-selection'
import { createKnowledgeItemFromChat } from './knowledge-bit-chat.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'

type Status = 'idle' | 'saving' | 'created' | 'failed'

const BUTTON_CLASS = 'min-h-11 rounded-md border border-neutral-300 px-3 py-1 text-xs sm:min-h-0'

export function AnkiReviewMakeCard({
  knowledgeBitId,
  question,
  variantId,
  answerRef,
}: {
  knowledgeBitId: string
  question: string
  variantId: string
  answerRef: RefObject<HTMLElement | null>
}) {
  const { selection, clear } = useCardSelection(answerRef, true, variantId)
  const online = useOnlineStatus()
  const [open, setOpen] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const requestId = useRef(0)

  function start() {
    setBack(selection.slice(0, MANUAL_ITEM_BACK_MAX_CHARS))
    setFront('')
    setStatus('idle')
    setOpen(true)
  }

  function close() {
    requestId.current += 1
    setOpen(false)
    clear()
  }

  async function create() {
    if (!online) return

    const current = ++requestId.current

    setStatus('saving')

    try {
      await createKnowledgeItemFromChat({
        data: {
          knowledgeBitId,
          front: front.trim(),
          back: back.trim(),
          aiGenerated: false,
          sourceLinks: [],
        },
      })

      if (current !== requestId.current) return

      notifyPendingReviewChanged()
      setOpen(false)
      clear()
      setStatus('created')
    } catch {
      if (current === requestId.current) setStatus('failed')
    }
  }

  const canCreate = online && status !== 'saving' && front.trim() !== '' && back.trim() !== ''

  if (open) {
    return (
      <div data-testid="make-card-sheet" className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
        <label className="text-xs font-medium text-neutral-500" htmlFor="make-card-front">
          Question
        </label>
        <textarea
          id="make-card-front"
          data-testid="make-card-front"
          value={front}
          rows={2}
          maxLength={MANUAL_ITEM_FRONT_MAX_CHARS}
          placeholder={question}
          onChange={(event) => setFront(event.target.value)}
          className="w-full rounded-md border border-neutral-300 p-2 text-sm"
        />
        <label className="text-xs font-medium text-neutral-500" htmlFor="make-card-back">
          Answer
        </label>
        <textarea
          id="make-card-back"
          data-testid="make-card-back"
          value={back}
          rows={3}
          maxLength={MANUAL_ITEM_BACK_MAX_CHARS}
          onChange={(event) => setBack(event.target.value)}
          className="w-full rounded-md border border-neutral-300 p-2 text-sm"
        />
        {!online && (
          <p role="alert" data-testid="make-card-offline" className="text-xs text-red-600">
            Making a card needs a connection.
          </p>
        )}
        {status === 'failed' && (
          <p role="alert" data-testid="make-card-error" className="text-xs text-red-600">
            Could not create the card. Try again.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="make-card-create"
            disabled={!canCreate}
            onClick={() => void create()}
            className={BUTTON_CLASS}
          >
            {status === 'saving' ? 'Creating' : 'Create card'}
          </button>
          <button
            type="button"
            data-testid="make-card-cancel"
            onClick={close}
            className={`${BUTTON_CLASS} border-transparent text-neutral-600`}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {selection !== '' && (
        <button
          type="button"
          data-testid="make-card-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={start}
          className={BUTTON_CLASS}
        >
          Make card
        </button>
      )}
      {status === 'created' && (
        <p role="status" data-testid="make-card-created" className="text-xs text-green-700">
          Card created
        </p>
      )}
    </div>
  )
}
