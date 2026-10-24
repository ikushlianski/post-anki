import { useEffect, useState, type RefObject } from 'react'
import { MAX_SUBJECT_CHAT_CONTEXT_CHARS } from '@post-anki/shared'

export function useCardSelection(areaRef: RefObject<HTMLElement | null>, enabled: boolean, resetKey: string) {
  const [captured, setCaptured] = useState({ key: resetKey, text: '' })

  useEffect(() => {
    if (!enabled) {
      return
    }

    const capture = () => {
      const area = areaRef.current
      const current = document.getSelection()

      if (!area || !current || current.isCollapsed || current.rangeCount === 0) {
        return
      }

      const range = current.getRangeAt(0)

      if (!area.contains(range.commonAncestorContainer)) {
        return
      }

      const text = current.toString().trim()

      if (text !== '') {
        setCaptured({ key: resetKey, text: text.slice(0, MAX_SUBJECT_CHAT_CONTEXT_CHARS) })
      }
    }

    document.addEventListener('selectionchange', capture)

    return () => document.removeEventListener('selectionchange', capture)
  }, [areaRef, enabled, resetKey])

  const selection = enabled && captured.key === resetKey ? captured.text : ''

  return { selection, clear: () => setCaptured({ key: resetKey, text: '' }) }
}
