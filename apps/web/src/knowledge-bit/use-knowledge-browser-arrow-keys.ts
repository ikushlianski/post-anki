import { useEffect } from 'react'

import { isTypingTarget, neighbourId } from './knowledge-browser-open-item'
import { BROWSER_ROW_SELECTOR } from './knowledge-browser-slide-over'

const DIRECTIONS = { ArrowUp: 'previous', ArrowDown: 'next' } as const

function scrollRowIntoView(id: string) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(BROWSER_ROW_SELECTOR))

  rows.find((row) => row.dataset.rowId === id)?.scrollIntoView?.({ block: 'nearest' })
}

export function useKnowledgeBrowserArrowKeys(
  ids: readonly string[],
  openId: string | null,
  onOpenChange: (id: string | null) => void,
) {
  useEffect(() => {
    if (!openId) {
      return undefined
    }

    function onKeyDown(event: KeyboardEvent) {
      const direction = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? DIRECTIONS[event.key] : null

      if (!direction || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      event.preventDefault()

      const next = neighbourId(ids, openId, direction)

      if (next) {
        onOpenChange(next)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ids, openId, onOpenChange])

  useEffect(() => {
    if (openId) {
      scrollRowIntoView(openId)
    }
  }, [openId])
}
