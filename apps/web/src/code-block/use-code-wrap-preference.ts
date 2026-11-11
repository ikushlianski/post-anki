import { useCallback, useState } from 'react'

export const CODE_WRAP_STORAGE_KEY = 'post-anki:code-wrap'

function readWrap(): boolean {
  try {
    return window.localStorage.getItem(CODE_WRAP_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function useCodeWrapPreference(): [boolean, () => void] {
  const [wrap, setWrap] = useState(readWrap)

  const toggle = useCallback(() => {
    const next = !wrap

    setWrap(next)

    try {
      window.localStorage.setItem(CODE_WRAP_STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      // storage unavailable: preference lasts for this view only
    }
  }, [wrap])

  return [wrap, toggle]
}
