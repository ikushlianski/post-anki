import type {
  ChosenLearningListDestination,
  LearningListItemStatus,
} from '@post-anki/shared'

import { ClassifyAction } from './classify-action'
import { DestinationChoice } from './destination-choice'
import { LivenessBadge } from './liveness-badge'
import { RecommendationReview } from './recommendation-review'
import { RecommendationSignals } from './recommendation-signals'
import {
  isVisuallyMuted,
  livenessDescription,
} from './liveness-presentation'
import { isAwaitingRecommendationDecision } from './recommendation-summary'
import type {
  ApiResult,
  LearningListItemWithLiveness,
} from './learning-list.model'

const STATUS_LABEL: Record<LearningListItemStatus, string> = {
  captured: 'Captured',
  classifying: 'Classifying…',
  classified: 'Awaiting your decision',
  folded_in: 'Folded into an Area',
  parked: 'Parked',
  course_created: 'Mini-course created',
  declined: 'Declined — nothing created',
  unreachable: 'Could not be read',
}

export interface LearningListItemRowProps {
  item: LearningListItemWithLiveness
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

export function LearningListItemRow({
  item,
  subjects,
  onResolve,
  onResolved,
  onChooseDestination,
  onChosen,
  onClassify,
  onClassified,
}: LearningListItemRowProps) {
  const title = item.title ?? item.url ?? 'Untitled capture'
  const muted = isVisuallyMuted(item.liveness)
  const awaitingDecision = isAwaitingRecommendationDecision(item)

  return (
    <li
      data-testid="learning-list-item"
      data-item-id={item.id}
      data-dormant={muted ? 'true' : 'false'}
      className={`rounded-xl border p-4 ${
        muted
          ? 'border-dashed border-neutral-300 bg-neutral-50 opacity-60'
          : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {item.url ?? 'pasted description'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {STATUS_LABEL[item.status]}
            {item.questionCeiling === null
              ? ''
              : ` · ${item.questionsGenerated}/${item.questionCeiling} questions`}
          </p>
        </div>
        <LivenessBadge liveness={item.liveness} />
      </div>

      <p className="mt-2 text-xs text-neutral-400">
        {livenessDescription(item.liveness)}
      </p>

      {item.recommendation !== null && awaitingDecision ? (
        <RecommendationReview
          itemId={item.id}
          title={title}
          recommendation={item.recommendation}
          onResolve={onResolve}
          onResolved={onResolved}
        />
      ) : null}

      {item.recommendation !== null && !awaitingDecision ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <RecommendationSignals
            recommendation={item.recommendation}
            awaitingDecision={false}
          />
        </div>
      ) : null}

      {item.status === 'parked' ? (
        <DestinationChoice
          itemId={item.id}
          onChoose={onChooseDestination}
          onChosen={onChosen}
        />
      ) : null}

      {item.status === 'captured' && item.url !== null ? (
        <ClassifyAction
          itemId={item.id}
          subjects={subjects}
          onClassify={onClassify}
          onClassified={onClassified}
        />
      ) : null}
    </li>
  )
}
