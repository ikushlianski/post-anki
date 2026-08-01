import { useEffect, useState } from 'react'

// False during server render and during this component's own hydration pass,
// true once React has actually committed it on the client. On a long
// curriculum page React 19 hydrates the tree progressively, so a control far
// down the page stays plain, handler-less markup for hundreds of milliseconds
// after the router-level "ready" flag has already resolved. Gating a control's
// `disabled` on this is what stops it from looking interactive before it is.
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return hydrated
}
