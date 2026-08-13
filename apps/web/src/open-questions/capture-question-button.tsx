import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  captureProbeQuestionOpenQuestion,
  captureSocraticTurnOpenQuestion,
} from './open-questions.api'

const MAX_QUESTION_LENGTH = 1000

type CaptureItemType = 'probe_question' | 'socratic_turn'

// open-questions-review (issue #87) — mirrors ItemFeedbackButtons' exact
// button → popover → save shape (apps/web/src/feedback/item-feedback-buttons.tsx),
// attached at the same two study-flow call sites, for the same reason: the
// item is rendered — mid-answer, post-reveal, or later — with no gating on
// answered state. Unlike feedback's comment, the question text is required
// (an empty captured "question" is meaningless), so the submit control stays
// disabled until there is real, non-whitespace, in-range content.
export function CaptureQuestionButton({
  itemType,
  itemId,
}: {
  itemType: CaptureItemType
  itemId: string
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [questionText, setQuestionText] = useState('')

  const mutation = useMutation({
    mutationFn: (vars: { questionText: string }) =>
      itemType === 'probe_question'
        ? captureProbeQuestionOpenQuestion({
            data: { questionId: itemId, questionText: vars.questionText },
          })
        : captureSocraticTurnOpenQuestion({
            data: { turnId: itemId, questionText: vars.questionText },
          }),
  })

  const trimmed = questionText.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_QUESTION_LENGTH

  function openPopover() {
    setPopoverOpen(true)
  }

  function closePopover() {
    setPopoverOpen(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    mutation.mutate(
      { questionText: trimmed },
      {
        onSuccess: () => {
          setPopoverOpen(false)
          setQuestionText('')
        },
      },
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`open-question-${itemId}`}>
      {!popoverOpen ? (
        <button
          type="button"
          data-testid={`capture-question-${itemId}`}
          onClick={openPopover}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm hover:border-neutral-400"
        >
          ❓ Ask later
        </button>
      ) : null}

      {popoverOpen ? (
        <form onSubmit={submit} className="flex min-w-[16rem] flex-1 flex-col gap-2">
          <textarea
            value={questionText}
            autoFocus
            disabled={mutation.isPending}
            onChange={(event) => setQuestionText(event.target.value)}
            placeholder="What's still unclear?"
            data-testid={`capture-question-input-${itemId}`}
            className="min-h-[3rem] flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={mutation.isPending || !canSubmit}
              data-testid={`capture-question-submit-${itemId}`}
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
            {trimmed.length > MAX_QUESTION_LENGTH ? (
              <span className="text-xs text-red-600">
                {trimmed.length}/{MAX_QUESTION_LENGTH}
              </span>
            ) : null}
          </div>
        </form>
      ) : mutation.isSuccess ? (
        <span className="text-xs text-emerald-600" data-testid={`capture-question-saved-${itemId}`}>
          Saved for later
        </span>
      ) : null}
    </div>
  )
}
