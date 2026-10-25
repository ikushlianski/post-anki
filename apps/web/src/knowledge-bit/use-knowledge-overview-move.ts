import { useState } from 'react'

import { moveKnowledgeBits } from './knowledge-overview.api'

const OVERVIEW_MOVE_FAILED_MESSAGE = 'Could not move cards. Try again.'

interface Options {
  selectedIds: string[]
  cursorId: string | null
  announce: (kind: 'polite' | 'assertive', text: string) => void
  onMoved: (moved: ReadonlySet<string>) => void
}

export function useKnowledgeOverviewMove(options: Options) {
  const { selectedIds, cursorId, announce, onMoved } = options
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
  }

  async function confirm(subjectId: string) {
    if (targetIds === null || busy) {
      return
    }

    setBusy(true)
    setError(null)

    let outcome: Awaited<ReturnType<typeof moveKnowledgeBits>> | null = null

    try {
      outcome = await moveKnowledgeBits({ data: { knowledgeBitIds: targetIds, subjectId } })
    } catch {
      outcome = null
    }

    setBusy(false)

    if (!outcome || !outcome.ok) {
      setError(OVERVIEW_MOVE_FAILED_MESSAGE)
      announce('assertive', OVERVIEW_MOVE_FAILED_MESSAGE)

      return
    }

    const moved = new Set(outcome.moved)
    const count = moved.size
    const noun = count === 1 ? 'card' : 'cards'

    setTargetIds(null)
    onMoved(moved)
    announce('polite', `Moved ${count} ${noun}.`)
  }

  return { targetCount: targetIds?.length ?? 0, isOpen: targetIds !== null, busy, error, open, cancel, confirm }
}
