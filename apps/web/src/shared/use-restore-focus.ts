import { useEffect, useRef, useState } from 'react'

export function useRestoreFocus(getReturnFocus?: () => HTMLElement | null | undefined) {
  const getReturnFocusRef = useRef(getReturnFocus)

  const [opener] = useState(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  getReturnFocusRef.current = getReturnFocus

  useEffect(() => {
    return () => {
      const target = getReturnFocusRef.current?.() ?? opener

      if (target?.isConnected) {
        target.focus()
      }
    }
  }, [opener])
}
