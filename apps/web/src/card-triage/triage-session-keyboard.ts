import { useEffect, useRef } from 'react'

import { isTypingTarget } from '../knowledge-bit/knowledge-bit-review-keyboard'

export function useTriageSessionKeys({
  onStart,
  onFinish,
}: {
  onStart: () => void
  onFinish: () => void
}): void {
  const handlers = useRef({ onStart, onFinish })

  handlers.current = { onStart, onFinish }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
        return
      }

      if (event.key === 's') {
        event.preventDefault()
        handlers.current.onStart()
      } else if (event.key === 'f') {
        event.preventDefault()
        handlers.current.onFinish()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
