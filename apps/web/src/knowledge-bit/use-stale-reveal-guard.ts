import { useEffect, useRef, type Dispatch } from 'react'
import type { ReviewCard } from '@post-anki/shared'

import type { AnkiReviewSessionAction, AnkiReviewSessionState } from './anki-review-session'

interface Shown {
  variantId: string
  shownAt: number
}

export function useStaleRevealGuard(
  state: AnkiReviewSessionState,
  card: ReviewCard | null,
  dispatch: Dispatch<AnkiReviewSessionAction>,
) {
  const last = useRef<Shown | null>(null)

  useEffect(() => {
    const previous = last.current

    last.current = card ? { variantId: card.variantId, shownAt: state.shownAt } : null

    if (!card || !previous || !state.revealed) {
      return
    }

    const replacedInPlace = state.edits[card.knowledgeBitId]?.replacesVariantId === previous.variantId

    if (card.variantId !== previous.variantId && state.shownAt === previous.shownAt && !replacedInPlace) {
      dispatch({ type: 'staleRevealCleared', now: Date.now() })
    }
  }, [card, state.shownAt, state.revealed, state.edits, dispatch])
}
