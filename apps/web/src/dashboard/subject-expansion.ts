import { useEffect, useState } from 'react'

export const EXPANDED_SUBJECTS_STORAGE_KEY = 'dashboard.expandedSubjects'

export type ExpandedSubjects = Record<string, boolean>

// Anything unreadable (missing, malformed, or blocked storage) counts as "all collapsed".
export function parseExpandedSubjects(raw: string | null): ExpandedSubjects {
  if (raw === null) {
    return {}
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => entry[1] === true),
    )
  } catch {
    return {}
  }
}

function readStoredExpandedSubjects(): ExpandedSubjects {
  try {
    return parseExpandedSubjects(window.localStorage.getItem(EXPANDED_SUBJECTS_STORAGE_KEY))
  } catch {
    return {}
  }
}

function writeStoredExpandedSubjects(expanded: ExpandedSubjects): void {
  try {
    window.localStorage.setItem(EXPANDED_SUBJECTS_STORAGE_KEY, JSON.stringify(expanded))
  } catch {
    // Storage may be unavailable; the toggle still works for this visit.
  }
}

// Starts collapsed on the server and on first paint, then loads the remembered state.
export function useExpandedSubjects() {
  const [expanded, setExpanded] = useState<ExpandedSubjects>({})

  useEffect(() => {
    setExpanded(readStoredExpandedSubjects())
  }, [])

  function toggle(subjectId: string) {
    setExpanded((current) => {
      const next = { ...current, [subjectId]: current[subjectId] !== true }

      writeStoredExpandedSubjects(next)

      return next
    })
  }

  function expand(subjectIds: string[]) {
    setExpanded((current) => {
      const next = { ...current }

      for (const subjectId of subjectIds) {
        next[subjectId] = true
      }

      writeStoredExpandedSubjects(next)

      return next
    })
  }

  return { expanded, toggle, expand }
}
