import type { ReviewCard } from '@post-anki/shared'

import { useOnlineStatus } from '../shared/use-online-status'
import { AnkiReviewCardActions } from './anki-review-card-actions'
import { cardShareText } from './card-share-text'
import { useReviewMoveControl } from './use-review-move-control'

export function AnkiReviewCardActionsWithMove({
  card,
  revealed,
  disabled,
  advanceWith,
  onEdit,
  onBury,
  onSuspend,
  onChat,
}: {
  card: ReviewCard
  revealed: boolean
  disabled: boolean
  advanceWith: (notice: string, save: () => Promise<boolean>) => Promise<boolean>
  onEdit: () => void
  onBury: () => void
  onSuspend: () => void
  onChat: () => void
}) {
  const online = useOnlineStatus()
  const move = useReviewMoveControl({ current: card, online, advanceWith })

  return (
    <AnkiReviewCardActions
      revealed={revealed}
      leech={card.leech}
      cardId={card.variantId}
      shareText={cardShareText(card)}
      disabled={disabled}
      onEdit={onEdit}
      onBury={onBury}
      onSuspend={onSuspend}
      onChat={onChat}
      onMove={move.onMove}
      movePicker={move.picker}
    />
  )
}
