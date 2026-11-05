import { useCallback, useEffect, useRef, useState } from 'react'

export type LeavingDestination = 'inbox' | 'chat'

export const LEAVING_CARD_MS = 350

export interface LeavingCard<T> {
  destination: LeavingDestination
  snapshot: T
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useLeavingCard<T>(durationMs: number = LEAVING_CARD_MS) {
  const [leaving, setLeaving] = useState<LeavingCard<T> | null>(null)
  const activeRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const start = useCallback(
    (destination: LeavingDestination, snapshot: T) => {
      if (activeRef.current || prefersReducedMotion()) {
        return
      }

      activeRef.current = true
      setLeaving({ destination, snapshot })
      timerRef.current = setTimeout(() => {
        activeRef.current = false
        setLeaving(null)
      }, durationMs)
    },
    [durationMs],
  )

  const isLeaving = useCallback(() => activeRef.current, [])

  return { leaving, start, isLeaving }
}
