import { useCallback, useEffect, useRef } from 'react'

export function useCardDwell(bitId: string | undefined) {
  const shownAt = useRef(new Map<string, number>())

  useEffect(() => {
    if (!bitId) {
      shownAt.current.clear()

      return
    }

    if (!shownAt.current.has(bitId)) {
      shownAt.current.set(bitId, Date.now())
    }
  }, [bitId])

  return useCallback((id: string): number | undefined => {
    const started = shownAt.current.get(id)

    shownAt.current.delete(id)

    return started === undefined ? undefined : Math.max(Date.now() - started, 0)
  }, [])
}
