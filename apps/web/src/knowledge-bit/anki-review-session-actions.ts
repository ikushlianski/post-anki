import { useRef, useState, type Dispatch } from 'react'
import type { ReviewCard, ReviewGrade } from '@post-anki/shared'

import type { AnkiReviewSessionAction, AnkiReviewSessionState } from './anki-review-session'
import { updateCardSchedule, type SubmitReviewOutcome } from './anki-review.api'
import { submitGradeOrQueue, undoGrade } from '../review-offline/submit-grade-or-queue'
import { confirmedGradeAction, isBatchExhausted, optimisticGradeAction } from './anki-review-optimistic-grade'
import { incrementDailyReviewCount } from './daily-review-storage'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { browserTimeZone } from '../shared/browser-time-zone'
import { cardScope, useReviewBackgroundActions, type EditDraft } from './use-review-background-actions'

export const NON_RETRYABLE_ERRORS = new Set(['not_approved', 'variant_not_found'])

const UNDO_REFUSED_NOTICE =
  "That grade can't be undone any more, because the card was reviewed again since."

function sameGradeAttempt(pending: PendingGrade | null, variantId: string, grade: ReviewGrade): pending is PendingGrade {
  return pending !== null && pending.variantId === variantId && pending.grade === grade
}

export function actionErrorMessage(error: string): string {
  if (NON_RETRYABLE_ERRORS.has(error)) {
    return 'This card is no longer available for review. Skip it to continue.'
  }

  return "Couldn't save that. Try again."
}

interface PendingGrade {
  variantId: string
  grade: ReviewGrade
  requestId: string
}

interface Input {
  state: AnkiReviewSessionState
  dispatch: Dispatch<AnkiReviewSessionAction>
  current: ReviewCard | null
  batchSize: number
  stamp: number
  burySiblings?: boolean
  refill: () => Promise<void>
}

export function useAnkiReviewSessionActions({ state, dispatch, current, batchSize, stamp, burySiblings = true, refill }: Input) {
  const [busy, setBusy] = useState(false)
  const [refilling, setRefilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedGrade, setFailedGrade] = useState<ReviewGrade | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const inFlight = useRef(false)
  const pendingGrade = useRef<PendingGrade | null>(null)

  async function exclusive(run: () => Promise<void>) {
    if (inFlight.current) {
      return
    }

    inFlight.current = true
    setBusy(true)
    setError(null)
    setFailedGrade(null)

    try {
      await run()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function moveOnAfter(action: AnkiReviewSessionAction) {
    const exhausted = isBatchExhausted(state, batchSize, action.type === 'acted' && Boolean(action.followUp))

    dispatch(action)

    if (exhausted) {
      setRefilling(true)
      await refill()
      dispatch({ type: 'refilled', now: Date.now() })
      setRefilling(false)
    }
  }

  async function advance(notice?: string) {
    setError(null)
    await moveOnAfter({ type: 'advance', now: Date.now(), notice })
  }

  const grade = (value: ReviewGrade) =>
    exclusive(async () => {
      if (!current) {
        return
      }

      const rehearsal = state.rehearsal && state.front.length > 0
      const durationMs = Math.min(Math.max(Date.now() - state.shownAt, 0), 86_400_000)
      const attempt = sameGradeAttempt(pendingGrade.current, current.variantId, value)
        ? pendingGrade.current
        : { variantId: current.variantId, grade: value, requestId: crypto.randomUUID() }

      pendingGrade.current = attempt

      const snapshot = state
      const exhausted = isBatchExhausted(state, batchSize, false)

      dispatch(
        optimisticGradeAction({
          rehearsal: Boolean(rehearsal),
          requestId: attempt.requestId,
          card: current,
          grade: value,
          durationMs,
          stamp,
          now: Date.now(),
        }),
      )

      if (exhausted) {
        setRefilling(true)
      }

      const outcome = await submitGradeOrQueue({
        variantId: current.variantId,
        knowledgeBitId: current.knowledgeBitId,
        grade: value,
        durationMs,
        requestId: attempt.requestId,
        tz: browserTimeZone(),
        burySiblings,
        rehearsal: Boolean(rehearsal),
      }).catch((): SubmitReviewOutcome => ({ ok: false, error: 'grade_save_failed' }))

      if (!outcome.ok) {
        dispatch({ type: 'gradeRolledBack', snapshot })
        setRefilling(false)
        setError(outcome.error)
        setFailedGrade(NON_RETRYABLE_ERRORS.has(outcome.error) ? null : value)
        return
      }

      pendingGrade.current = null

      if (!rehearsal) {
        incrementDailyReviewCount()
        notifyPendingReviewChanged()
        dispatch(confirmedGradeAction(attempt.requestId, outcome))
      }

      const followUp = !rehearsal && Boolean(outcome.followUp)

      if (exhausted && !followUp) {
        await refill()
        dispatch({ type: 'refilled', now: Date.now() })
      }

      setRefilling(false)
    })

  const gradeKey = async (value: ReviewGrade) => {
    if (state.rehearsal && state.front.length > 0 && value !== 'again' && value !== 'good') {
      return
    }

    await grade(value)
  }

  const undo = () =>
    exclusive(async () => {
      const entry = state.undo[state.undo.length - 1]

      if (!entry) {
        return
      }

      const outcome =
        entry.kind === 'grade'
          ? await undoGrade(entry.reviewId, entry.card.variantId)
          : await updateCardSchedule({
              data: {
                knowledgeBitId: entry.card.knowledgeBitId,
                ...cardScope(entry.card),
                tz: browserTimeZone(),
                ...(entry.kind === 'suspend' ? { suspended: false } : { buried: false }),
              },
            })

      if (outcome.ok) {
        notifyPendingReviewChanged()
        dispatch({ type: 'undone', now: Date.now() })
        return
      }

      if (outcome.error === 'not_latest' || outcome.error === 'review_not_found') {
        dispatch({ type: 'undoDropped', notice: UNDO_REFUSED_NOTICE })
        return
      }

      setError(outcome.error)
    }).catch(() => setError('undo_failed'))

  const background = useReviewBackgroundActions({
    state,
    dispatch,
    current,
    batchSize,
    stamp,
    refill,
    exclusive,
    setError,
    setRefilling,
    setEditError,
    setEditDraft,
  })

  const saveEdit = (prompt: string, answer: string, context?: string | null) =>
    background.submitEdit(context === undefined ? { prompt, answer } : { prompt, answer, context })

  const saveNote = (note: string) => background.submitEdit({ note })

  const saveList = (list: string) => background.submitEdit({ list })

  const retryGrade = () => (failedGrade === null ? undefined : grade(failedGrade))

  return {
    busy,
    refilling,
    error,
    editError,
    rehearsal: state.rehearsal && state.front.length > 0,
    canRetryGrade: failedGrade !== null,
    grade,
    gradeKey,
    retryGrade,
    control: background.control,
    advanceWith: background.advanceWith,
    editDraft,
    undo,
    saveEdit,
    saveNote,
    saveList,
    advance,
    setEditError: (message: string | null) => {
      setEditError(message)
      setEditDraft(null)
    },
  }
}
