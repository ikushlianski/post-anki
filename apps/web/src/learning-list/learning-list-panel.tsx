import { LearningListItemRow } from './learning-list-item-row'
import type {
  ApiResult,
  LearningListItemWithLiveness,
} from './learning-list.model'

export interface LearningListPanelProps {
  items: LearningListItemWithLiveness[]
  onResolve: (input: {
    itemId: string
    decision: 'approve' | 'decline'
  }) => Promise<ApiResult<unknown>>
  onResolved: () => void | Promise<void>
}

export function LearningListPanel({
  items,
  onResolve,
  onResolved,
}: LearningListPanelProps) {
  if (items.length === 0) {
    return (
      <p
        data-testid="learning-list-empty"
        className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500"
      >
        Nothing captured yet. Paste an article, a series or a video above.
      </p>
    )
  }

  return (
    <ul data-testid="learning-list" className="space-y-3">
      {items.map((item) => (
        <LearningListItemRow
          key={item.id}
          item={item}
          onResolve={onResolve}
          onResolved={onResolved}
        />
      ))}
    </ul>
  )
}
