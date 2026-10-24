import { useState } from 'react'
import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

import { updateCardSchedule } from './anki-review.api'
import type { OverviewRowState } from './knowledge-overview-table'

interface Options {
  announce: (kind: 'polite' | 'assertive', text: string) => void
  onUpdated: () => void
}

export function useKnowledgeOverviewRowActions({ announce, onUpdated }: Options) {
  const [rowStates, setRowStates] = useState<Record<string, OverviewRowState>>({})

  function setRowState(id: string, state: OverviewRowState | null) {
    setRowStates((previous) => {
      const next = { ...previous }

      if (state) {
        next[id] = state
      } else {
        delete next[id]
      }

      return next
    })
  }

  async function toggleSuspend(item: KnowledgeBitOverviewItem) {
    const id = item.knowledgeBitId
    const suspending = item.state !== 'suspended'

    setRowState(id, { pending: true, failed: false })

    let succeeded = false

    try {
      succeeded = (await updateCardSchedule({ data: { knowledgeBitId: id, suspended: suspending } })).ok
    } catch {
      succeeded = false
    }

    if (!succeeded) {
      setRowState(id, { pending: false, failed: true })
      announce('assertive', 'Could not update the card.')

      return
    }

    setRowState(id, null)
    announce('polite', suspending ? 'Card suspended.' : 'Card unsuspended.')
    onUpdated()
  }

  return { rowStates, toggleSuspend: (item: KnowledgeBitOverviewItem) => void toggleSuspend(item) }
}
