import type { ChosenLearningListDestination } from '@post-anki/shared'

import { LearningListItemRow } from './learning-list-item-row'
import type {
  ApiResult,
  LearningListItemWithLiveness,
} from './learning-list.model'

export interface LearningListPanelProps {
  items: LearningListItemWithLiveness[]
  subjects: Array<{ id: string; name: string }>
  onResolve: (input: {
    itemId: string
    decision: 'approve' | 'decline'
  }) => Promise<ApiResult<unknown>>
  onResolved: () => void | Promise<void>
  onChooseDestination: (input: {
    itemId: string
    destination: ChosenLearningListDestination
  }) => Promise<ApiResult<unknown>>
  onChosen: () => void | Promise<void>
  onClassify: (input: {
    itemId: string
    subjectId: string
    subSubjectNodeId: string | null
  }) => Promise<ApiResult<unknown>>
  onClassified: () => void | Promise<void>
}

export function LearningListPanel({
  items,
  subjects,
  onResolve,
  onResolved,
  onChooseDestination,
  onChosen,
  onClassify,
  onClassified,
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
          subjects={subjects}
          onResolve={onResolve}
          onResolved={onResolved}
          onChooseDestination={onChooseDestination}
          onChosen={onChosen}
          onClassify={onClassify}
          onClassified={onClassified}
        />
      ))}
    </ul>
  )
}
