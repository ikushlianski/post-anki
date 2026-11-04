import { useEffect, useState } from 'react'
import type { PendingKnowledgeBitDuplicateOf } from '@post-anki/shared'

import { loadSimilarCard, similarCardIds, type SimilarCard } from './duplicate-similar-cards'

export interface SimilarCardsState {
  cards: SimilarCard[]
  loading: boolean
  failedCount: number
}

export function useSimilarCards(duplicateOf: PendingKnowledgeBitDuplicateOf): SimilarCardsState {
  const [state, setState] = useState<SimilarCardsState>({ cards: [], loading: true, failedCount: 0 })

  useEffect(() => {
    let active = true
    const ids = similarCardIds(duplicateOf)

    setState({ cards: [], loading: true, failedCount: 0 })

    void Promise.all(ids.map((id) => loadSimilarCard(id, duplicateOf))).then((results) => {
      if (!active) {
        return
      }

      const cards = results.filter((card): card is SimilarCard => card !== null)

      setState({ cards, loading: false, failedCount: ids.length - cards.length })
    })

    return () => {
      active = false
    }
  }, [duplicateOf])

  return state
}
