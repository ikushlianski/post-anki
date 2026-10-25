import { useCallback, useState } from 'react'
import { z } from 'zod'

export const MIN_COLUMN_WIDTH = 60

const storedWidthsSchema = z.record(z.string(), z.number().finite())

export type ColumnWidths = Record<string, number>

function clamp(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width))
}

function readWidths(storageKey: string, defaults: ColumnWidths): ColumnWidths {
  const merged = { ...defaults }

  try {
    const raw = window.localStorage.getItem(storageKey)

    if (!raw) {
      return merged
    }

    const parsed = storedWidthsSchema.safeParse(JSON.parse(raw))

    if (!parsed.success) {
      return merged
    }

    for (const id of Object.keys(defaults)) {
      const stored = parsed.data[id]

      if (stored !== undefined) {
        merged[id] = clamp(stored)
      }
    }
  } catch {
    return { ...defaults }
  }

  return merged
}

function writeWidths(storageKey: string, widths: ColumnWidths) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths))
  } catch {
    return
  }
}

export function useColumnWidths(storageKey: string, defaults: ColumnWidths) {
  const [widths, setWidths] = useState<ColumnWidths>(() => readWidths(storageKey, defaults))

  const setWidth = useCallback(
    (id: string, width: number) => {
      setWidths((current) => {
        const next = { ...current, [id]: clamp(width) }

        writeWidths(storageKey, next)

        return next
      })
    },
    [storageKey],
  )

  return { widths, setWidth }
}
