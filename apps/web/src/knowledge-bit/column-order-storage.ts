import type { SavedColumnLayout } from './knowledge-browser-column-layout'

const LEGACY_KEY_PREFIX = 'knowledge-browser-columns:v1'
const STORAGE_KEY_PREFIX = 'knowledge-browser-columns:v2'

function legacyKey(tableId: string): string {
  return `${LEGACY_KEY_PREFIX}:${tableId}`
}

function storageKey(tableId: string): string {
  return `${STORAGE_KEY_PREFIX}:${tableId}`
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : null
}

function readJson(key: string): unknown {
  const raw = window.localStorage.getItem(key)

  return raw === null ? null : JSON.parse(raw)
}

export function readColumnLayout(tableId: string): SavedColumnLayout | null {
  if (typeof window === 'undefined') return null

  try {
    const current = readJson(storageKey(tableId))

    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      const record = current as Record<string, unknown>

      return { order: stringList(record.order), hidden: stringList(record.hidden) }
    }

    const legacy = stringList(readJson(legacyKey(tableId)))

    return legacy ? { order: legacy, hidden: null } : null
  } catch {
    return null
  }
}

export function writeColumnLayout(
  tableId: string,
  layout: { order: readonly string[]; hidden: readonly string[] },
): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(layout))
  } catch {
    return
  }
}

export function clearColumnLayout(tableId: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(storageKey(tableId))
    window.localStorage.removeItem(legacyKey(tableId))
  } catch {
    return
  }
}
