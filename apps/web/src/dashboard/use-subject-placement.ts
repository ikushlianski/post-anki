import { useEffect, useState } from 'react'

import type { Subject } from '../curriculum/model'

export const SUBJECT_HIGHLIGHT_MS = 2000

// Parent chain from the nearest parent upward, stopping at a missing parent or a cycle.
export function ancestorIdsOf(subjectId: string, subjects: Subject[]): string[] {
  const parentById = new Map(subjects.map((subject) => [subject.id, subject.parentId]))
  const ancestors: string[] = []
  let current = parentById.get(subjectId) ?? null

  while (
    current !== null &&
    current !== subjectId &&
    parentById.has(current) &&
    !ancestors.includes(current)
  ) {
    ancestors.push(current)
    current = parentById.get(current) ?? null
  }

  return ancestors
}

type Highlight =
  | { kind: 'subject'; subjectId: string }
  | { kind: 'new-child'; parentId: string; previousIds: string[] }

// A new child is identified as the first sibling that was not in the list before it was created.
function resolveHighlightedId(highlight: Highlight | null, subjects: Subject[]): string | null {
  if (highlight === null) {
    return null
  }

  if (highlight.kind === 'subject') {
    return highlight.subjectId
  }

  const created = subjects.find(
    (subject) =>
      subject.parentId === highlight.parentId && !highlight.previousIds.includes(subject.id),
  )

  return created?.id ?? null
}

function findRowElement(subjectId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-subject-row]')).find(
    (element) => element.dataset.subjectRow === subjectId,
  )
}

// Expands the destination parent and its ancestors, then highlights the affected row.
export function useSubjectPlacement(
  subjects: Subject[],
  expandSubjects: (subjectIds: string[]) => void,
) {
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const highlightedId = resolveHighlightedId(highlight, subjects)

  useEffect(() => {
    if (highlightedId === null) {
      return
    }

    const timer = setTimeout(() => setHighlight(null), SUBJECT_HIGHLIGHT_MS)

    return () => clearTimeout(timer)
  }, [highlight, highlightedId])

  useEffect(() => {
    if (highlightedId === null) {
      return
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    findRowElement(highlightedId)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    })
  }, [highlight, highlightedId])

  function expandParentPath(parentId: string) {
    expandSubjects([parentId, ...ancestorIdsOf(parentId, subjects)])
  }

  return {
    highlightedId,
    revealNewChild(parentId: string, previousIds: string[]) {
      expandParentPath(parentId)
      setHighlight({ kind: 'new-child', parentId, previousIds })
    },
    revealMovedSubject(subjectId: string, parentId: string | null) {
      if (parentId !== null) {
        expandParentPath(parentId)
      }

      setHighlight({ kind: 'subject', subjectId })
    },
  }
}
