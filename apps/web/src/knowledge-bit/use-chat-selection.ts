import { useEffect, useState, type RefObject } from 'react'

export function useChatSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState('')

  useEffect(() => {
    function onSelectionChange() {
      const current = window.getSelection()
      const container = containerRef.current

      if (!current || !container || current.isCollapsed) {
        setSelection('')

        return
      }

      const inside =
        container.contains(current.anchorNode) && container.contains(current.focusNode)

      setSelection(inside ? current.toString().trim() : '')
    }

    document.addEventListener('selectionchange', onSelectionChange)

    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [containerRef])

  function clearSelection() {
    window.getSelection()?.removeAllRanges()
    setSelection('')
  }

  return { selection, clearSelection }
}
