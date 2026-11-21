import type { Dispatch } from 'react'
import type { ReviewCard } from '@post-anki/shared'

import type { AnkiReviewSessionAction, AnkiReviewSessionState, SessionEdit } from './anki-review-session'
import { editReviewCard, updateCardSchedule } from './anki-review.api'
import { isBatchExhausted } from './anki-review-optimistic-grade'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { browserTimeZone } from '../shared/browser-time-zone'

export interface EditDraft {
  prompt: string
  answer: string
  context?: string | null
}

type EditPayload = EditDraft | { note: string } | { list: string }

interface Input {
  state: AnkiReviewSessionState
  dispatch: Dispatch<AnkiReviewSessionAction>
  current: ReviewCard | null
  batchSize: number
  stamp: number
  refill: () => Promise<void>
  exclusive: (run: () => Promise<void>) => Promise<void>
  setError: (error: string | null) => void
  setRefilling: (value: boolean) => void
  setEditError: (error: string | null) => void
  setEditDraft: (draft: EditDraft | null) => void
}

export function cardScope(card: ReviewCard): { variantId?: string } {
  return card.cardKey ? { variantId: card.variantId } : {}
}

function editFailureMessage(outcome: { error: string; message?: string }): string {
  if (outcome.error === 'not_found') {
    return 'This card was changed or removed elsewhere.'
  }

  if ((outcome.error === 'invalid_note' || outcome.error === 'invalid_list') && outcome.message) {
    return outcome.message
  }

  return "Couldn't save the edit. Try again."
}

function sessionEdit(
  current: ReviewCard,
  payload: EditPayload,
  saved?: { variantId: string; prompt?: string | null; answer?: string | null },
): SessionEdit {
  return {
    variantId: saved?.variantId ?? current.variantId,
    replacesVariantId: current.variantId,
    prompt: saved?.prompt ?? ('prompt' in payload ? payload.prompt.trim() : current.prompt),
    answer: saved?.answer ?? ('answer' in payload ? payload.answer.trim() : current.answer),
    context:
      'context' in payload && payload.context !== undefined
        ? payload.context?.trim() || null
        : (current.context ?? null),
  }
}

export function useReviewBackgroundActions(input: Input) {
  const { state, dispatch, current, batchSize, stamp, refill, exclusive, setError, setRefilling, setEditError, setEditDraft } = input

  async function runOptimistic(action: AnkiReviewSessionAction, save: () => Promise<boolean>): Promise<boolean> {
    const snapshot = state
    const exhausted = isBatchExhausted(state, batchSize, false)

    dispatch(action)

    if (exhausted) {
      setRefilling(true)
    }

    const saved = await save().catch(() => false)

    if (!saved) {
      dispatch({ type: 'gradeRolledBack', snapshot })
      setRefilling(false)

      return false
    }

    if (exhausted) {
      await refill()
      dispatch({ type: 'refilled', now: Date.now() })
      setRefilling(false)
    }

    return true
  }

  async function advanceWith(notice: string, save: () => Promise<boolean>): Promise<boolean> {
    let saved = false

    await exclusive(async () => {
      saved = await runOptimistic({ type: 'advance', now: Date.now(), notice }, save)
    })

    return saved
  }

  const control = (kind: 'suspend' | 'bury') =>
    exclusive(async () => {
      if (!current) {
        return
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('control_failed')

        return
      }

      let failure = 'control_failed'

      const saved = await runOptimistic({ type: 'acted', entry: { kind, card: current, stamp }, now: Date.now() }, async () => {
        const outcome = await updateCardSchedule({
          data: {
            knowledgeBitId: current.knowledgeBitId,
            ...cardScope(current),
            tz: browserTimeZone(),
            ...(kind === 'suspend' ? { suspended: true } : { buried: true }),
          },
        }).catch(() => ({ ok: false as const, error: 'control_failed' }))

        if (!outcome.ok) {
          failure = outcome.error

          return false
        }

        notifyPendingReviewChanged()

        return true
      })

      if (!saved) {
        setError(failure)
      }
    })

  const callEdit = (card: ReviewCard, payload: EditPayload) =>
    editReviewCard({ data: { variantId: card.variantId, ...payload } }).catch(() => ({
      ok: false as const,
      error: 'edit_failed',
      message: undefined,
    }))

  const submitEdit = (payload: EditPayload) =>
    exclusive(async () => {
      if (!current) {
        return
      }

      setEditError(null)
      setEditDraft(null)

      const optimistic = 'prompt' in payload
      const snapshot = state

      if (optimistic) {
        dispatch({ type: 'editSaved', knowledgeBitId: current.knowledgeBitId, edit: sessionEdit(current, payload), now: Date.now() })
      }

      const outcome = await callEdit(current, payload)

      if (!outcome.ok) {
        if (optimistic) {
          dispatch({ type: 'gradeRolledBack', snapshot })
          setEditDraft(payload)
        }

        setEditError(editFailureMessage(outcome))

        return
      }

      dispatch({
        type: 'editSaved',
        knowledgeBitId: current.knowledgeBitId,
        edit: sessionEdit(current, payload, outcome),
        now: Date.now(),
      })
    })

  return { control, submitEdit, advanceWith }
}
