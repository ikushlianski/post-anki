import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { deleteKnowledgeSourceById } from './knowledge-browser-source.api'
import { idsFromSource } from './knowledge-browser-source'

export const SOURCE_DELETE_FAILED_MESSAGE = 'Could not delete the source. Nothing was removed. Try again.'

export function useKnowledgeBrowserSourceDelete(
  rows: readonly KnowledgeBitBrowserItem[],
  onDeleted: () => void,
) {
  const queryClient = useQueryClient()
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = sourceId ? rows.find((row) => row.sourceId === sourceId) : undefined
  const count = sourceId ? idsFromSource(rows, sourceId).length : 0

  function open(id: string) {
    if (!busy) {
      setError(null)
      setSourceId(id)
    }
  }

  function cancel() {
    if (!busy) {
      setSourceId(null)
      setError(null)
    }
  }

  async function confirm() {
    if (!sourceId || busy) {
      return
    }

    setBusy(true)
    setError(null)

    let ok = false

    try {
      ok = (await deleteKnowledgeSourceById({ data: { id: sourceId } })).ok
    } catch {
      ok = false
    }

    setBusy(false)

    if (!ok) {
      setError(SOURCE_DELETE_FAILED_MESSAGE)

      return
    }

    setSourceId(null)
    onDeleted()
    await queryClient.invalidateQueries({ queryKey: ['knowledge-bits'] })
  }

  return {
    sourceId,
    label: first?.sourceLabel ?? null,
    count,
    busy,
    error,
    open,
    cancel,
    confirm,
    countFor: (id: string) => idsFromSource(rows, id).length,
  }
}

export type BrowserSourceDelete = ReturnType<typeof useKnowledgeBrowserSourceDelete>
