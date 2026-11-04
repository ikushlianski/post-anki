import { useEffect, useRef } from 'react'

import { isTypingTarget } from './knowledge-bit-review-keyboard'

export type FocusKeyAction = 'approve' | 'reject' | 'undo' | 'chat' | 'inbox' | 'example' | 'option-prev' | 'option-next'

export interface FocusKeyEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat?: boolean
  target: EventTarget | null
}

const FOCUS_KEY_ACTIONS: Readonly<Record<string, FocusKeyAction>> = {
  a: 'approve',
  r: 'reject',
  x: 'reject',
  z: 'undo',
  c: 'chat',
  i: 'inbox',
  e: 'example',
}

const OPTION_KEY_ACTIONS: Readonly<Record<string, FocusKeyAction>> = {
  ArrowUp: 'option-prev',
  ArrowDown: 'option-next',
  ArrowLeft: 'option-prev',
  ArrowRight: 'option-next',
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, summary') !== null
}

export const FOCUS_HANDLED_KEYS: readonly string[] = [
  ...Object.keys(FOCUS_KEY_ACTIONS),
  ...Object.keys(OPTION_KEY_ACTIONS),
  'Enter',
]

export function resolveFocusKey(event: FocusKeyEventLike, hasOptions = false): FocusKeyAction | null {
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

  if (event.key === 'Enter') {
    return isInteractiveTarget(event.target) ? null : 'approve'
  }

  return (hasOptions ? OPTION_KEY_ACTIONS[event.key] : undefined) ?? FOCUS_KEY_ACTIONS[event.key] ?? null
}

export function useFocusKeyboard(
  onAction: (action: FocusKeyAction) => void,
  enabled: boolean,
  hasOptions = false,
): void {
  const handler = useRef(onAction)
  const options = useRef(hasOptions)

  handler.current = onAction
  options.current = hasOptions

  useEffect(() => {
    if (!enabled) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isTypingTarget(event.target)) {
        ;(event.target as HTMLElement).blur()

        return
      }

      const action = resolveFocusKey(event, options.current)

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
