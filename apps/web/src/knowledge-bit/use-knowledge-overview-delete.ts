import { useState } from 'react'
import type { BulkDeleteKnowledgeBitsResponse } from '@post-anki/shared'

import { deleteKnowledgeBits } from './knowledge-overview.api'
import { OVERVIEW_DELETE_FAILED_MESSAGE, describeOverviewDeleteResult } from './knowledge-overview-result'
import { pickFocusAfterRemoval } from './knowledge-overview-selection'

interface Options {
  rowIds: string[]
  selectedIds: string[]
  cursorId: string | null
  announce: (kind: 'polite' | 'assertive', text: string) => void
  requestFocus: (rowId: string | null) => void
  onRemoved: (removed: ReadonlySet<string>) => void
}

function removedIds(result: BulkDeleteKnowledgeBitsResponse): Set<string> {
  return new Set([
    ...result.deleted,
    ...result.skipped.filter((entry) => entry.reason === 'not_found').map((entry) => entry.id),
  ])
}

export function useKnowledgeOverviewDelete(options: Options) {
  const { rowIds, selectedIds, cursorId, announce, requestFocus, onRemoved } = options
  const [targetIds, setTargetIds] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open() {
    const ids = selectedIds.length > 0 ? selectedIds : cursorId ? [cursorId] : []

    if (ids.length === 0 || targetIds !== null) {
      return
    }

    setError(null)
    setTargetIds(ids)
  }

  function cancel() {
    setTargetIds(null)
    setError(null)
    requestFocus(cursorId)
  }

  async function confirm() {
    if (targetIds === null || busy) {
      return
    }

    setBusy(true)
    setError(null)

    let outcome: Awaited<ReturnType<typeof deleteKnowledgeBits>> | null = null

    try {
      outcome = await deleteKnowledgeBits({ data: { knowledgeBitIds: targetIds } })
    } catch {
      outcome = null
    }

    setBusy(false)

    if (!outcome || !outcome.ok) {
      setError(OVERVIEW_DELETE_FAILED_MESSAGE)
      announce('assertive', OVERVIEW_DELETE_FAILED_MESSAGE)

      return
    }

    const removed = removedIds(outcome)
    const nextFocus = pickFocusAfterRemoval(rowIds, removed, cursorId)

    setTargetIds(null)
    onRemoved(removed)
    announce('polite', describeOverviewDeleteResult(outcome))
    requestFocus(nextFocus)
  }

  return { targetCount: targetIds?.length ?? 0, isOpen: targetIds !== null, busy, error, open, cancel, confirm }
}
