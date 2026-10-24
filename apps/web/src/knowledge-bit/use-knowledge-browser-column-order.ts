import { useEffect, useState } from 'react'

import { applyColumnOrder } from './column-order'
import { clearColumnOrder, readColumnOrder, writeColumnOrder } from './column-order-storage'
import { DEFAULT_BROWSER_COLUMNS } from './knowledge-browser-columns'
import type { BrowserColumnId } from './knowledge-browser-columns'

export function useKnowledgeBrowserColumnOrder(tableId: string) {
  const [order, setOrder] = useState<BrowserColumnId[]>(DEFAULT_BROWSER_COLUMNS)

  useEffect(() => {
    setOrder(applyColumnOrder(readColumnOrder(tableId), DEFAULT_BROWSER_COLUMNS) as BrowserColumnId[])
  }, [tableId])

  function changeOrder(next: BrowserColumnId[]) {
    setOrder(next)
    writeColumnOrder(tableId, next)
  }

  function reset() {
    setOrder(DEFAULT_BROWSER_COLUMNS)
    clearColumnOrder(tableId)
  }

  const isDefault = order.every((id, index) => id === DEFAULT_BROWSER_COLUMNS[index])

  return { order, changeOrder, reset, isDefault }
}
