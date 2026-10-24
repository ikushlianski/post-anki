import { isTypingTarget } from './knowledge-bit-review-keyboard'

export type OverviewFocusTarget = 'previous' | 'next' | 'first' | 'last'

export type OverviewKeyAction =
  | { type: 'focus'; to: OverviewFocusTarget; extend: boolean }
  | { type: 'toggle' }
  | { type: 'select-all' }
  | { type: 'clear' }
  | { type: 'delete' }
  | { type: 'move' }

export interface OverviewKeyEvent {
  key: string
  code?: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat: boolean
  target: EventTarget | null
}

const FOCUS_KEYS: Record<string, OverviewFocusTarget> = {
  ArrowUp: 'previous',
  ArrowDown: 'next',
  Home: 'first',
  End: 'last',
}

function isButtonTarget(target: EventTarget | null): boolean {
  return (target as HTMLElement | null)?.tagName === 'BUTTON'
}

export function resolveOverviewKey(event: OverviewKeyEvent): OverviewKeyAction | null {
  if (isTypingTarget(event.target) || isButtonTarget(event.target) || event.altKey) {
    return null
  }

  const modifier = event.ctrlKey || event.metaKey

  if (modifier) {
    const isSelectAllKey = event.code === 'KeyA' || event.key.toLowerCase() === 'a'
    const isSelectAll = isSelectAllKey && !event.shiftKey && !event.repeat

    return isSelectAll ? { type: 'select-all' } : null
  }

  const focusTarget = FOCUS_KEYS[event.key]

  if (focusTarget) {
    return { type: 'focus', to: focusTarget, extend: event.shiftKey }
  }

  if (event.repeat || event.shiftKey) {
    return null
  }

  switch (event.key) {
    case ' ':
      return { type: 'toggle' }
    case 'Escape':
      return { type: 'clear' }
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' }
    case 'm':
    case 'M':
      return { type: 'move' }
    default:
      return null
  }
}

export function resolveFocusedRowId(
  orderedIds: readonly string[],
  cursor: string | null,
  to: OverviewFocusTarget,
): string | null {
  if (orderedIds.length === 0) {
    return null
  }

  const index = cursor === null ? -1 : orderedIds.indexOf(cursor)

  switch (to) {
    case 'first':
      return orderedIds[0]
    case 'last':
      return orderedIds[orderedIds.length - 1]
    case 'next':
      return orderedIds[Math.min(index + 1, orderedIds.length - 1)]
    case 'previous':
      return orderedIds[Math.max(index === -1 ? 0 : index - 1, 0)]
  }
}
