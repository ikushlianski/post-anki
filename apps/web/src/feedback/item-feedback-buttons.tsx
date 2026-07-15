import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { submitProbeQuestionFeedback, submitSocraticTurnFeedback } from './feedback.api'

type FeedbackItemType = 'probe_question' | 'socratic_turn'
type Rating = 'up' | 'down'

export function ItemFeedbackButtons({
  itemType,
  itemId,
}: {
  itemType: FeedbackItemType
  itemId: string
}) {
  const [rating, setRating] = useState<Rating | null>(null)
  const [comment, setComment] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (vars: { rating: Rating; comment?: string }) =>
      itemType === 'probe_question'
        ? submitProbeQuestionFeedback({
            data: { questionId: itemId, rating: vars.rating, comment: vars.comment },
          })
        : submitSocraticTurnFeedback({
            data: { turnId: itemId, rating: vars.rating, comment: vars.comment },
          }),
  })

  function vote(next: Rating) {
    setRating(next)
    setPopoverOpen(true)
    setSaved(false)
    mutation.mutate({ rating: next, comment: comment.trim() || undefined })
  }

  function submitComment(event: FormEvent) {
    event.preventDefault()

    if (!rating) {
      return
    }

    mutation.mutate({ rating, comment: comment.trim() || undefined })
    setPopoverOpen(false)
    setSaved(true)
  }

  function closePopover() {
    setPopoverOpen(false)

    if (rating) {
      setSaved(true)
    }
  }

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2"
      data-testid={`item-feedback-${itemId}`}
    >
      <button
        type="button"
        data-testid={`feedback-up-${itemId}`}
        aria-pressed={rating === 'up'}
        disabled={mutation.isPending}
        onClick={() => vote('up')}
        className={thumbClass(rating === 'up')}
      >
        👍
      </button>
      <button
        type="button"
        data-testid={`feedback-down-${itemId}`}
        aria-pressed={rating === 'down'}
        disabled={mutation.isPending}
        onClick={() => vote('down')}
        className={thumbClass(rating === 'down')}
      >
        👎
      </button>

      {popoverOpen ? (
        <form onSubmit={submitComment} className="flex min-w-[12rem] flex-1 gap-2">
          <input
            value={comment}
            autoFocus
            disabled={mutation.isPending}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What should change next time? (optional)"
            data-testid={`feedback-comment-input-${itemId}`}
            className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            data-testid={`feedback-comment-submit-${itemId}`}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-500 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={closePopover}
            className="text-xs text-neutral-400 hover:text-neutral-700"
          >
            Close
          </button>
        </form>
      ) : saved ? (
        <span className="text-xs text-emerald-600" data-testid={`feedback-saved-${itemId}`}>
          Feedback saved
        </span>
      ) : null}
    </div>
  )
}

function thumbClass(active: boolean): string {
  const base = 'rounded-md border px-2 py-1 text-sm transition-colors disabled:opacity-50'

  return active
    ? `${base} border-neutral-500 bg-neutral-100`
    : `${base} border-neutral-200 bg-white hover:border-neutral-400`
}
