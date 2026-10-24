import { useEffect, useRef } from 'react'

export type VariantKeyAction = `variant-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

export type ReviewKeyAction =
  | 'next'
  | 'previous'
  | 'approve'
  | 'keep'
  | 'reject'
  | 'undo'
  | 'approve-source'
  | VariantKeyAction

export function variantIndexOf(action: ReviewKeyAction): number | null {
  return action.startsWith('variant-') ? Number(action.slice('variant-'.length)) - 1 : null
}

const ACTIVATABLE_TAGS = new Set(['BUTTON', 'A'])

export interface ReviewKeyEventLike {
  key: string
  code?: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  target: EventTarget | null
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null

  if (!element || typeof element.tagName !== 'string') {
    return false
  }

  return TYPING_TAGS.has(element.tagName) || element.isContentEditable === true
}

export function resolveReviewKey(event: ReviewKeyEventLike): ReviewKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
    return null
  }

  if (event.code === 'Numpad4') {
    return 'previous'
  }

  if (event.code === 'Numpad6') {
    return 'next'
  }

  if (/^[1-9]$/.test(event.key)) {
    return `variant-${event.key}` as VariantKeyAction
  }

  switch (event.key) {
    case 'Enter': {
      const tag = (event.target as HTMLElement | null)?.tagName

      return tag && ACTIVATABLE_TAGS.has(tag) ? null : 'keep'
    }
    case 'x':
    case 'X':
      return 'reject'
    case 'z':
    case 'Z':
      return 'undo'
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'previous'
    case 'a':
      return 'approve'
    case 'r':
      return 'reject'
    case 'A':
      return 'approve-source'
    default:
      return null
  }
}

export function useReviewKeyboard(onAction: (action: ReviewKeyAction) => void): void {
  const handler = useRef(onAction)

  handler.current = onAction

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = resolveReviewKey(event)

      if (!action) {
        return
      }

      event.preventDefault()
      handler.current(action)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
