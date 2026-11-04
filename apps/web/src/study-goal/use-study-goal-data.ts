import { useCallback, useEffect, useRef, useState } from 'react'

import { settle, type LoadResult } from '../shared/load-result'

export function useStudyGoalData<T>(
  load: () => Promise<T>,
  refreshKey: number | string = 0,
): { result: LoadResult<T> | null; reload: () => void } {
  const [result, setResult] = useState<LoadResult<T> | null>(null)
  const [reloads, setReloads] = useState(0)
  const loadRef = useRef(load)

  loadRef.current = load

  useEffect(() => {
    let cancelled = false

    void settle((async () => loadRef.current())()).then((next) => {
      if (!cancelled) {
        setResult(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [refreshKey, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  return { result, reload }
}
