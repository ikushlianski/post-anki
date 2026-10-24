const STORAGE_KEY_PREFIX = 'knowledge-browser-columns:v1'

function storageKey(tableId: string): string {
  return `${STORAGE_KEY_PREFIX}:${tableId}`
}

export function readColumnOrder(tableId: string): string[] | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(storageKey(tableId))
    const parsed: unknown = raw === null ? null : JSON.parse(raw)

    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed : null
  } catch {
    return null
  }
}

export function writeColumnOrder(tableId: string, order: readonly string[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(order))
  } catch {
    return
  }
}

export function clearColumnOrder(tableId: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(storageKey(tableId))
  } catch {
    return
  }
}
