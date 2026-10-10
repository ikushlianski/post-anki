import { useRef, useState, type Dispatch } from 'react'
import type { ReviewCard, ReviewGrade } from '@post-anki/shared'

import type { AnkiReviewSessionAction, AnkiReviewSessionState, SessionUndoEntry } from './anki-review-session'
import { editReviewCard, submitReview, undoReview, updateCardSchedule } from './anki-review.api'

export const NON_RETRYABLE_ERRORS = new Set(['not_approved', 'variant_not_found'])

const LEECH_NOTICE =
  'This card was forgotten again and suspended as a leech. Consider rewriting it.'
const UNDO_REFUSED_NOTICE =
  "That grade can't be undone any more, because the card was reviewed again since."

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function actionErrorMessage(error: string): string {
  if (NON_RETRYABLE_ERRORS.has(error)) {
    return 'This card is no longer available for review. Skip it to continue.'
  }

  return "Couldn't save that. Try again."
}

interface Input {
  state: AnkiReviewSessionState
  dispatch: Dispatch<AnkiReviewSessionAction>
  current: ReviewCard | null
  batchSize: number
  stamp: number
  refill: () => Promise<void>
}

export function useAnkiReviewSessionActions({ state, dispatch, current, batchSize, stamp, refill }: Input) {
  const [busy, setBusy] = useState(false)
  const [refilling, setRefilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function exclusive(run: () => Promise<void>) {
    if (inFlight.current) {
      return
    }

    inFlight.current = true
    setBusy(true)
    setError(null)

    try {
      await run()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function moveOnAfter(action: AnkiReviewSessionAction) {
    const fromFront = state.front.length > 0
    const nextIndex = fromFront ? state.index : state.index + 1
    const exhausted = state.front.length <= 1 && nextIndex >= batchSize

    dispatch(action)

    if (exhausted) {
      setRefilling(true)
      await refill()
      dispatch({ type: 'refilled', now: Date.now() })
      setRefilling(false)
    }
  }

  async function advance() {
    setError(null)
    await moveOnAfter({ type: 'advance', now: Date.now() })
  }

  const grade = (value: ReviewGrade) =>
    exclusive(async () => {
      if (!current) {
        return
      }

      const durationMs = Math.min(Math.max(Date.now() - state.shownAt, 0), 86_400_000)
      const outcome = await submitReview({
        data: { variantId: current.variantId, grade: value, durationMs },
      }).catch(() => ({ ok: false as const, error: 'grading_failed' }))

      if (!outcome.ok) {
        setError(outcome.error)
        return
      }

      const leechSuspended = outcome.leech && outcome.suspended
      const entry: SessionUndoEntry = {
        kind: 'grade',
        reviewId: outcome.reviewId,
        card: current,
        grade: value,
        durationMs,
        leechSuspended,
        stamp,
      }

      await moveOnAfter({
        type: 'acted',
        entry,
        now: Date.now(),
        notice: leechSuspended ? LEECH_NOTICE : undefined,
      })
    })

  const control = (kind: 'suspend' | 'bury') =>
    exclusive(async () => {
      if (!current) {
        return
      }

      const outcome = await updateCardSchedule({
        data: {
          knowledgeBitId: current.knowledgeBitId,
          tz: browserTimeZone(),
          ...(kind === 'suspend' ? { suspended: true } : { buried: true }),
        },
      }).catch(() => ({ ok: false as const, error: 'control_failed' }))

      if (!outcome.ok) {
        setError(outcome.error)
        return
      }

      await moveOnAfter({ type: 'acted', entry: { kind, card: current, stamp }, now: Date.now() })
    })

  const undo = () =>
    exclusive(async () => {
      const entry = state.undo[state.undo.length - 1]

      if (!entry) {
        return
      }

      const outcome =
        entry.kind === 'grade'
          ? await undoReview({ data: { reviewId: entry.reviewId } })
          : await updateCardSchedule({
              data: {
                knowledgeBitId: entry.card.knowledgeBitId,
                tz: browserTimeZone(),
                ...(entry.kind === 'suspend' ? { suspended: false } : { buried: false }),
              },
            })

      if (outcome.ok) {
        dispatch({ type: 'undone', now: Date.now() })
        return
      }

      if (outcome.error === 'not_latest' || outcome.error === 'review_not_found') {
        dispatch({ type: 'undoDropped', notice: UNDO_REFUSED_NOTICE })
        return
      }

      setError(outcome.error)
    }).catch(() => setError('undo_failed'))

  const saveEdit = (prompt: string, answer: string) =>
    exclusive(async () => {
      if (!current) {
        return
      }

      setEditError(null)

      const outcome = await editReviewCard({
        data: { variantId: current.variantId, prompt, answer },
      }).catch(() => ({ ok: false as const, error: 'edit_failed' }))

      if (!outcome.ok) {
        setEditError(
          outcome.error === 'not_found'
            ? 'This card was changed or removed elsewhere.'
            : "Couldn't save the edit. Try again.",
        )
        return
      }

      dispatch({
        type: 'editSaved',
        knowledgeBitId: current.knowledgeBitId,
        edit: { variantId: outcome.variantId, prompt: prompt.trim(), answer: answer.trim() },
        now: Date.now(),
      })
    })

  return { busy, refilling, error, editError, grade, control, undo, saveEdit, advance, setEditError }
}
