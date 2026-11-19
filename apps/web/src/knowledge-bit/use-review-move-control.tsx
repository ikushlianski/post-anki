import { useState, type ReactNode } from 'react'
import type { ReviewCard } from '@post-anki/shared'

import { resolveCardSubjectId } from '../subject-chat/card-subject'
import { AnkiReviewMovePicker } from './anki-review-move-picker'
import { useReviewCardMove } from './use-review-card-move'

export function useReviewMoveControl(input: {
  current: ReviewCard | null
  online: boolean
  advance: (notice: string) => Promise<void>
}): { onMove: () => void; picker: ReactNode } {
  const { current } = input
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const cardMove = useReviewCardMove(input)
  const open = current !== null && openCardId === current.variantId

  return {
    onMove: () => {
      cardMove.clearMoveError()
      setOpenCardId(open || !current ? null : current.variantId)
    },
    picker: open && (
      <AnkiReviewMovePicker
        currentSubjectId={resolveCardSubjectId(current)}
        busy={cardMove.moving}
        error={cardMove.moveError}
        onPick={(subjectId, label) => void cardMove.move(subjectId, label)}
        onClose={() => setOpenCardId(null)}
      />
    ),
  }
}
