import { useEffect, useState } from 'react'

import { clearColumnLayout, readColumnLayout, writeColumnLayout } from './column-order-storage'
import {
  isDefaultLayout,
  reorderVisible,
  resolveColumnLayout,
  toggleColumn,
  visibleColumns,
} from './knowledge-browser-column-layout'
import type { ColumnLayout } from './knowledge-browser-column-layout'
import { DEFAULT_BROWSER_COLUMNS } from './knowledge-browser-columns'
import type { BrowserColumnId } from './knowledge-browser-columns'

function defaultLayout(): ColumnLayout<BrowserColumnId> {
  return resolveColumnLayout(null, DEFAULT_BROWSER_COLUMNS)
}

export function useKnowledgeBrowserColumnOrder(tableId: string) {
  const [layout, setLayout] = useState<ColumnLayout<BrowserColumnId>>(defaultLayout)

  useEffect(() => {
    setLayout(resolveColumnLayout(readColumnLayout(tableId), DEFAULT_BROWSER_COLUMNS))
  }, [tableId])

  function save(next: ColumnLayout<BrowserColumnId>) {
    setLayout(next)
    writeColumnLayout(tableId, next)
  }

  function changeOrder(nextVisible: BrowserColumnId[]) {
    save(reorderVisible(layout, nextVisible))
  }

  function toggle(id: BrowserColumnId) {
    save(toggleColumn(layout, id))
  }

  function reset() {
    setLayout(defaultLayout())
    clearColumnLayout(tableId)
  }

  return {
    order: visibleColumns(layout),
    hidden: layout.hidden,
    allColumns: layout.order,
    changeOrder,
    toggle,
    reset,
    isDefault: isDefaultLayout(layout, DEFAULT_BROWSER_COLUMNS),
  }
}

export type BrowserColumns = ReturnType<typeof useKnowledgeBrowserColumnOrder>
