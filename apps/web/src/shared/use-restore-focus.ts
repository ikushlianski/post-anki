import { useEffect, useRef } from 'react'

export function useRestoreFocus(getReturnFocus?: () => HTMLElement | null | undefined) {
  const getReturnFocusRef = useRef(getReturnFocus)

  getReturnFocusRef.current = getReturnFocus

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    return () => {
      const target = getReturnFocusRef.current?.() ?? opener

      if (target?.isConnected) {
        target.focus()
      }
    }
  }, [])
}
