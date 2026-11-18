import { useCallback, useState } from 'react'

export const SHOW_CARD_IDS_STORAGE_KEY = 'post-anki:show-card-ids'

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHOW_CARD_IDS_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function useShowCardIds(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(readEnabled)

  const update = useCallback((next: boolean) => {
    setEnabled(next)

    try {
      window.localStorage.setItem(SHOW_CARD_IDS_STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      return
    }
  }, [])

  return [enabled, update]
}
