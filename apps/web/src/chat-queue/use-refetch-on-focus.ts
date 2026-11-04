import { useEffect, useRef } from 'react'

const THROTTLE_MS = 10_000

export function useRefetchOnFocus(callback: () => void) {
  const callbackRef = useRef(callback)

  callbackRef.current = callback

  useEffect(() => {
    let last = Date.now()

    function trigger() {
      const now = Date.now()

      if (now - last < THROTTLE_MS) {
        return
      }

      last = now
      callbackRef.current()
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        trigger()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', trigger)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', trigger)
    }
  }, [])
}
