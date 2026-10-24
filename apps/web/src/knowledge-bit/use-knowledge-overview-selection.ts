import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { focusPageHeading } from '../ui/focus-page-heading'
import { resolveFocusedRowId, resolveOverviewKey } from './knowledge-overview-keyboard'
import { describeOverviewSelection } from './knowledge-overview-result'
import {
  clearSelection,
  emptySelection,
  extendTo,
  pruneSelection,
  selectAllLoaded,
  selectedInOrder,
  setCursor,
  toggleRow,
} from './knowledge-overview-selection'
import type { OverviewSelection, OverviewSelectionUpdate } from './knowledge-overview-selection'
import type { OverviewFocusRequest } from './knowledge-overview-table'

interface Options {
  rowIds: string[]
  announce: (kind: 'polite' | 'assertive', text: string) => void
  onDeleteRequested: () => void
  onMoveRequested: () => void
}

export function useKnowledgeOverviewSelection({ rowIds, announce, onDeleteRequested, onMoveRequested }: Options) {
  const [selection, setSelection] = useState<OverviewSelection>(emptySelection)
  const [focusRequest, setFocusRequest] = useState<OverviewFocusRequest | null>(null)
  const idsKey = rowIds.join('|')

  useEffect(() => {
    setSelection((current) => pruneSelection(current, rowIds))
  }, [idsKey])

  useEffect(() => {
    if (focusRequest && focusRequest.rowId === null) {
      focusPageHeading()
    }
  }, [focusRequest])

  function requestFocus(rowId: string | null) {
    setFocusRequest((current) => ({ rowId, nonce: (current?.nonce ?? 0) + 1 }))
  }

  function applyUpdate(update: OverviewSelectionUpdate, focusRowId?: string) {
    setSelection(update.selection)
    announce('polite', describeOverviewSelection(update.selection.selected.size, update.capped))

    if (focusRowId) {
      requestFocus(focusRowId)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const action = resolveOverviewKey(event)

    if (!action) {
      return
    }

    event.preventDefault()

    switch (action.type) {
      case 'focus': {
        const target = resolveFocusedRowId(rowIds, selection.cursor, action.to)

        if (target === null) {
          return
        }

        if (action.extend) {
          applyUpdate(extendTo(selection, rowIds, target), target)
        } else {
          setSelection(setCursor(selection, target))
          requestFocus(target)
        }

        return
      }
      case 'toggle':
        if (selection.cursor !== null) {
          applyUpdate(toggleRow(selection, selection.cursor))
        }

        return
      case 'select-all':
        applyUpdate(selectAllLoaded(selection, rowIds))

        return
      case 'clear':
        clear()

        return
      case 'delete':
        onDeleteRequested()
        return
      case 'move':
        onMoveRequested()
    }
  }

  function clear() {
    if (selection.selected.size === 0) {
      return
    }

    setSelection(clearSelection(selection))
    announce('polite', describeOverviewSelection(0, false))
  }

  function handleCheckboxClick(id: string, shiftKey: boolean) {
    const update =
      shiftKey && selection.anchor !== null
        ? extendTo(selection, rowIds, id)
        : toggleRow(selection, id)

    applyUpdate(update, id)
  }

  return {
    selection,
    selectedIds: selectedInOrder(selection, rowIds),
    focusRequest,
    requestFocus,
    clear,
    handleKeyDown,
    handleCheckboxClick,
    handleRowFocus: (id: string) => setSelection((current) => setCursor(current, id)),
  }
}
