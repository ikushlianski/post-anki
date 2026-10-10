import { useEffect, useRef } from 'react'

export type ReviewKeyAction = 'next' | 'previous' | 'approve' | 'reject' | 'approve-source'

export interface ReviewKeyEventLike {
  key: string
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

  switch (event.key) {
    case 'j':
      return 'next'
    case 'k':
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
