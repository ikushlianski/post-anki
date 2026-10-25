import { useState } from 'react'
import type { SubjectCheckConfidence, SubjectCheckNewSubject, SubjectCheckRecommendation } from '@post-anki/shared'

import type { SubjectCheckState } from './use-subject-check'

const CONFIDENCE_LABELS: Record<SubjectCheckConfidence, string> = {
  high: 'Strong match',
  medium: 'Likely match',
  low: 'Possible match',
}

const KIND_LABELS: Record<SubjectCheckNewSubject['kind'], string> = {
  business: 'business subject',
  language: 'language subject',
  general: 'general subject',
}

const BUTTON_BASE = 'inline-flex min-h-[44px] items-center rounded-md px-3 py-1.5 text-sm disabled:opacity-50'
const PRIMARY_BUTTON = `${BUTTON_BASE} bg-neutral-900 font-medium text-white`
const SECONDARY_BUTTON = `${BUTTON_BASE} border border-neutral-300 text-neutral-700 hover:bg-neutral-100`

export interface SubjectCheckPanelProps {
  state: SubjectCheckState
  busy: boolean
  onUse: (subjectId: string) => void
  onCreate: (proposal: SubjectCheckNewSubject) => void
  onPickAnother: () => void
  onAddWithoutSubject: () => void
}

function RecommendationRow({
  recommendation,
  busy,
  onUse,
}: {
  recommendation: SubjectCheckRecommendation
  busy: boolean
  onUse: (subjectId: string) => void
}) {
  return (
    <li
      data-testid={`subject-check-row-${recommendation.subjectId}`}
      className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-neutral-900">{recommendation.subjectLabel}</p>
        <p className="text-xs text-neutral-500">{CONFIDENCE_LABELS[recommendation.confidence]}</p>
        {recommendation.reason && <p className="break-words text-sm text-neutral-700">{recommendation.reason}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`Use subject ${recommendation.subjectLabel}`}
        data-testid={`subject-check-use-${recommendation.subjectId}`}
        data-emphasis={recommendation.confidence === 'high' ? 'primary' : 'secondary'}
        onClick={() => onUse(recommendation.subjectId)}
        className={recommendation.confidence === 'high' ? PRIMARY_BUTTON : SECONDARY_BUTTON}
      >
        Use this subject
      </button>
    </li>
  )
}

function NewSubjectRow({
  proposal,
  busy,
  onCreate,
  onDecline,
}: {
  proposal: SubjectCheckNewSubject
  busy: boolean
  onCreate: (proposal: SubjectCheckNewSubject) => void
  onDecline: () => void
}) {
  const placement = proposal.parentLabel ? `under ${proposal.parentLabel}` : 'at the top level'

  return (
    <li
      data-testid="subject-check-new-subject"
      className="flex flex-col gap-2 rounded-md border border-dashed border-neutral-300 bg-white p-3"
    >
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-neutral-900">New subject: {proposal.name}</p>
        <p className="text-xs text-neutral-500">
          A {KIND_LABELS[proposal.kind]}, created {placement}
        </p>
        {proposal.reason && <p className="break-words text-sm text-neutral-700">{proposal.reason}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          aria-label={`Create subject ${proposal.name} and add`}
          data-testid="subject-check-create"
          onClick={() => onCreate(proposal)}
          className={SECONDARY_BUTTON}
        >
          Create and add
        </button>
        <button
          type="button"
          disabled={busy}
          data-testid="subject-check-decline-new"
          onClick={onDecline}
          className={SECONDARY_BUTTON}
        >
          No thanks
        </button>
      </div>
    </li>
  )
}

export function SubjectCheckPanel({
  state,
  busy,
  onUse,
  onCreate,
  onPickAnother,
  onAddWithoutSubject,
}: SubjectCheckPanelProps) {
  const [declinedNew, setDeclinedNew] = useState(false)
  const advice = state.status === 'advice' && state.response.status === 'ok' ? state.response : null
  const proposal = advice && !declinedNew ? advice.newSubject : null

  return (
    <div role="status" aria-live="polite" data-testid="subject-check-region">
      {state.status === 'checking' && (
        <p data-testid="subject-check-checking" className="text-sm text-neutral-600">
          Checking subject…
        </p>
      )}

      {advice && (
        <section
          aria-label="Suggested subjects"
          data-testid="subject-check-panel"
          className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3"
        >
          <p className="text-sm font-medium text-neutral-800">Where should this go? Nothing is saved until you choose.</p>
          <ul className="space-y-2">
            {advice.recommendations.map((recommendation) => (
              <RecommendationRow
                key={recommendation.subjectId}
                recommendation={recommendation}
                busy={busy}
                onUse={onUse}
              />
            ))}
            {proposal && (
              <NewSubjectRow
                proposal={proposal}
                busy={busy}
                onCreate={onCreate}
                onDecline={() => setDeclinedNew(true)}
              />
            )}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              data-testid="subject-check-pick-another"
              onClick={onPickAnother}
              className={SECONDARY_BUTTON}
            >
              Pick another
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="subject-check-add-without"
              onClick={onAddWithoutSubject}
              className={SECONDARY_BUTTON}
            >
              Add without a subject
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

export function UnfiledNotice() {
  return (
    <p data-testid="knowledge-unfiled-notice" className="text-sm text-amber-700">
      Added without a subject because suggestions were unavailable. You can move the items to a subject later.
    </p>
  )
}
