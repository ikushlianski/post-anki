import { useEffect } from 'react'
import type { RefObject } from 'react'

import { isTypingTarget } from '../knowledge-bit/knowledge-bit-review-keyboard'

export function useSearchShortcut(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return
      }

      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey

      if (!commandK && !(slash && !isTypingTarget(event.target))) {
        return
      }

      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [inputRef])
}
