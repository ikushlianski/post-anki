import { useEffect, useRef, useState } from 'react'
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
  const [unselectedCount, setUnselectedCount] = useState(0)
  const selectionRef = useRef(selection)
  const idsKey = rowIds.join('\n')
  const count = selection.selected.size

  selectionRef.current = selection

  useEffect(() => {
    const current = selectionRef.current
    const next = pruneBrowserSelection(current, rowIds)
    const dropped = current.selected.size - next.selected.size

    if (dropped > 0) {
      setSelection(next)
      setUnselectedCount(dropped)
    }
  }, [idsKey])

  function clear() {
    setUnselectedCount(0)
    setSelection(EMPTY_BROWSER_SELECTION)
    setConfirming(false)
    setError(null)
  }

  function toggleRow(id: string, shift: boolean) {
    setUnselectedCount(0)
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

    setUnselectedCount(0)
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
    unselectedCount,
    confirming,
    busy,
    error,
    toggleRow,
    addRows: (ids: string[]) => {
      setUnselectedCount(0)
      setSelection((current) => addBrowserRows(current, ids))
    },
    toggleAll: () => {
      setUnselectedCount(0)
      setSelection((current) => toggleAllBrowserRows(current, rowIds))
    },
    openConfirm,
    cancelConfirm,
    confirm,
    clear,
  }
}

export type BrowserSelectionDelete = ReturnType<typeof useKnowledgeBrowserSelectionDelete>
