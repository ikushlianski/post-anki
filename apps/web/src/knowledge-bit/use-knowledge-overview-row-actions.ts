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

  async function setSuspendedMany(ids: string[], suspended: boolean) {
    if (ids.length === 0) {
      return
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return (await updateCardSchedule({ data: { knowledgeBitId: id, suspended } })).ok
        } catch {
          return false
        }
      }),
    )
    const failed = results.filter((ok) => !ok).length

    if (failed > 0) {
      announce('assertive', `Could not update ${failed} of ${ids.length} cards.`)
    } else {
      announce('polite', suspended ? `${ids.length} cards suspended.` : `${ids.length} cards unsuspended.`)
    }

    onUpdated()
  }

  return {
    rowStates,
    toggleSuspend: (item: KnowledgeBitOverviewItem) => void toggleSuspend(item),
    setSuspendedMany: (ids: string[], suspended: boolean) => void setSuspendedMany(ids, suspended),
  }
}
