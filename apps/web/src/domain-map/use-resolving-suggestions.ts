import { useCallback, useRef, useState } from 'react'

// The page-level "Scan now" / "Trigger review" buttons already guard their
// own double-click with `if (busy) return` + `disabled={busy}`; the per-item
// accept/reject buttons had no equivalent, which is what made a plain
// double-click reach the backend twice and (before the pending guard landed)
// create two real domain nodes from one suggestion.
//
// The claim is held in a ref, not only in state: two clicks arriving inside
// one React batch would both read the pre-update state and both pass a
// state-only guard — the same gap already found and closed on the mobile
// Today/practice screens. The state copy exists purely so the buttons
// re-render as disabled.
export function useResolvingSuggestions() {
  const claimedIds = useRef(new Set<string>())
  const [resolvingIds, setResolvingIds] = useState<readonly string[]>([])

  const claim = useCallback((suggestionId: string): boolean => {
    if (claimedIds.current.has(suggestionId)) {
      return false
    }

    claimedIds.current.add(suggestionId)
    setResolvingIds((previous) => [...previous, suggestionId])

    return true
  }, [])

  const release = useCallback((suggestionId: string) => {
    claimedIds.current.delete(suggestionId)
    setResolvingIds((previous) => previous.filter((id) => id !== suggestionId))
  }, [])

  return {
    claim,
    release,
    isResolving: (suggestionId: string) => resolvingIds.includes(suggestionId),
  }
}
