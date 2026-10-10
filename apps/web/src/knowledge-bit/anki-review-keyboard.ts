import { useEffect, useEffectEvent } from 'react'
import type { ReviewGrade } from '@post-anki/shared'

export interface ReviewKeyFacts {
  key: string
  repeat: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  targetIsEditable: boolean
}

export interface ReviewScreenFacts {
  hasCard: boolean
  revealed: boolean
  busy: boolean
}

export type ReviewKeyAction = { type: 'reveal' } | { type: 'grade'; grade: ReviewGrade }

const GRADE_KEYS: Record<string, ReviewGrade> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
}

export function ankiReviewKeyAction(
  event: ReviewKeyFacts,
  screen: ReviewScreenFacts,
): ReviewKeyAction | null {
  if (event.targetIsEditable || event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
    return null
  }

  if (!screen.hasCard || screen.busy) {
    return null
  }

  if (!screen.revealed) {
    return event.key === ' ' ? { type: 'reveal' } : null
  }

  const grade = GRADE_KEYS[event.key]

  return grade ? { type: 'grade', grade } : null
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function useAnkiReviewKeyboard(
  screen: ReviewScreenFacts,
  onAction: (action: ReviewKeyAction) => void,
): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = ankiReviewKeyAction(
      {
        key: event.key,
        repeat: event.repeat,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetIsEditable: isEditableTarget(event.target),
      },
      screen,
    )

    if (!action) {
      return
    }

    event.preventDefault()
    onAction(action)
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event)

    window.addEventListener('keydown', listener)

    return () => window.removeEventListener('keydown', listener)
  }, [])
}
