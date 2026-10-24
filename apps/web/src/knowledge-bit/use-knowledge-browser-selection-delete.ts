import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { purgeKnowledgeBits } from './knowledge-browser-purge.api'
import {
  addBrowserRows,
  EMPTY_BROWSER_SELECTION,
  pruneBrowserSelection,
  selectBrowserRange,
  toggleAllBrowserRows,
  toggleBrowserRow,
} from './knowledge-browser-selection'
import type { BrowserSelection } from './knowledge-browser-selection'

export const BROWSER_DELETE_FAILED_MESSAGE = 'Could not delete. Nothing was removed. Try again.'

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

export function useKnowledgeBrowserSelectionDelete(rowIds: string[]) {
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<BrowserSelection>(EMPTY_BROWSER_SELECTION)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idsKey = rowIds.join('\n')
  const count = selection.selected.size

  useEffect(() => {
    setSelection((current) => pruneBrowserSelection(current, rowIds))
  }, [idsKey])

  function clear() {
    setSelection(EMPTY_BROWSER_SELECTION)
    setConfirming(false)
    setError(null)
  }

  function toggleRow(id: string, shift: boolean) {
    setSelection((current) =>
      shift ? selectBrowserRange(current, rowIds, id) : toggleBrowserRow(current, id),
    )
  }

  function openConfirm() {
    if (count > 0 && !busy) {
      setError(null)
      setConfirming(true)
    }
  }

  function cancelConfirm() {
    if (!busy) {
      setConfirming(false)
      setError(null)
    }
  }

  async function confirm() {
    if (!confirming || busy || count === 0) {
      return
    }

    setBusy(true)
    setError(null)

    let ok = false

    try {
      ok = (await purgeKnowledgeBits({ data: { ids: [...selection.selected] } })).ok
    } catch {
      ok = false
    }

    setBusy(false)

    if (!ok) {
      setError(BROWSER_DELETE_FAILED_MESSAGE)

      return
    }

    setSelection(EMPTY_BROWSER_SELECTION)
    setConfirming(false)
    await queryClient.invalidateQueries({ queryKey: ['knowledge-bits'] })
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target) || count === 0) {
        return
      }

      if (event.key === 'Delete') {
        event.preventDefault()
        openConfirm()
      } else if (event.key === 'Escape') {
        event.preventDefault()

        if (confirming) {
          cancelConfirm()
        } else if (!busy) {
          clear()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return {
    selected: selection.selected,
    count,
    confirming,
    busy,
    error,
    toggleRow,
    addRows: (ids: string[]) => setSelection((current) => addBrowserRows(current, ids)),
    toggleAll: () => setSelection((current) => toggleAllBrowserRows(current, rowIds)),
    openConfirm,
    cancelConfirm,
    confirm,
    clear,
  }
}

export type BrowserSelectionDelete = ReturnType<typeof useKnowledgeBrowserSelectionDelete>
