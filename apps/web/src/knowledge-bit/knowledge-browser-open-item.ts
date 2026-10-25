import type { BrowserSearch } from './knowledge-browser-filters'

export type RowClickIntent = 'open' | 'toggle' | 'range' | 'ignore'

export interface RowClickInput {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  target: EventTarget | null
}

const INTERACTIVE_SELECTOR = 'button, a, input, label'

export function rowClickIntent({ shiftKey, metaKey, ctrlKey, target }: RowClickInput): RowClickIntent {
  if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
    return 'ignore'
  }

  if (shiftKey) {
    return 'range'
  }

  return metaKey || ctrlKey ? 'toggle' : 'open'
}

export type OpenNavigationMode = 'push' | 'replace'

export function openNavigationMode(current: string | undefined, next: string | null): OpenNavigationMode {
  return next === null || current !== undefined ? 'replace' : 'push'
}

export function withOpen(search: BrowserSearch, open: string | null | undefined): BrowserSearch {
  const { open: _dropped, ...rest } = search

  return open ? { ...rest, open } : rest
}

export type ArrowDirection = 'previous' | 'next'

export function neighbourId(ids: readonly string[], openId: string | null, direction: ArrowDirection): string | null {
  const index = openId ? ids.indexOf(openId) : -1

  if (index === -1) {
    return null
  }

  return ids[direction === 'next' ? index + 1 : index - 1] ?? null
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}
