import { useQuery } from '@tanstack/react-query'
import type { MutableRefObject } from 'react'

import { browserTimeZone } from '../shared/browser-time-zone'
import { getReviewCards } from './anki-review.api'
import { isScoped, reviewQueueQueryKey, stopWhenNothingDue, type AnkiReviewScope } from './anki-review-queue'
import { withoutGradedThisSession, type SessionUndoEntry } from './anki-review-session'

const BATCH_LIMIT = 10

export function useAnkiReviewQueue({
  scope,
  aheadDays,
  undoRef,
  studyAheadRef,
}: {
  scope: AnkiReviewScope
  aheadDays: number
  undoRef: MutableRefObject<SessionUndoEntry[]>
  studyAheadRef: MutableRefObject<boolean>
}) {
  return useQuery({
    queryKey: [...reviewQueueQueryKey(scope), aheadDays],
    queryFn: async () => {
      const outcome = await getReviewCards({ data: { limit: BATCH_LIMIT, tz: browserTimeZone(), aheadDays, ...scope } })

      if (!outcome.ok) return outcome

      const stop = isScoped(scope) && !studyAheadRef.current && undoRef.current.length > 0

      return stopWhenNothingDue({ ...outcome, cards: withoutGradedThisSession(outcome.cards, undoRef.current) }, stop)
    },
  })
}
