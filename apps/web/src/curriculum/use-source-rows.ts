import { useState } from 'react'

import type { SourceDraft, SourceKind } from './model'

export type DraftRow = SourceDraft & { id: string }

export function useSourceRows() {
  const [rows, setRows] = useState<DraftRow[]>([])

  function addRow(kind: SourceKind) {
    setRows((current) => [...current, { id: crypto.randomUUID(), kind, value: '' }])
  }

  function updateRow(id: string, value: string) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row)),
    )
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  function reset() {
    setRows([])
  }

  function toDrafts(): SourceDraft[] {
    return rows
      .filter((row) => row.value.trim() !== '')
      .map((row) => ({ kind: row.kind, value: row.value.trim(), title: row.title }))
  }

  return { rows, addRow, updateRow, removeRow, reset, toDrafts }
}
