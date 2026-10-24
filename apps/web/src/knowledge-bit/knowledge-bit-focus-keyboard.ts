import { useEffect, useRef } from 'react'

import { isTypingTarget } from './knowledge-bit-review-keyboard'

export type FocusKeyAction = 'approve' | 'reject' | 'undo'

export interface FocusKeyEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat?: boolean
  target: EventTarget | null
}

export function resolveFocusKey(event: FocusKeyEventLike): FocusKeyAction | null {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    isTypingTarget(event.target)
  ) {
    return null
  }

  switch (event.key) {
    case 'ArrowRight':
    case 'a':
      return 'approve'
    case 'ArrowLeft':
    case 'r':
    case 'x':
      return 'reject'
    case 'z':
      return 'undo'
    default:
      return null
  }
}

export function useFocusKeyboard(onAction: (action: FocusKeyAction) => void, enabled: boolean): void {
  const handler = useRef(onAction)

  handler.current = onAction

  useEffect(() => {
    if (!enabled) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isTypingTarget(event.target)) {
        ;(event.target as HTMLElement).blur()

        return
      }

      const action = resolveFocusKey(event)

      if (!action) {
        return
      }

      event.preventDefault()
      handler.current(action)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
