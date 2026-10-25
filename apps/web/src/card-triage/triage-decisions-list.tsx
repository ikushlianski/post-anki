import {
  KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS,
  KNOWLEDGE_BIT_REJECT_REASONS,
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  type KnowledgeBitRejectReason,
  type TriageDecision,
  type TriageDecisionResponse,
} from '@post-anki/shared'

import { TEXT_FIELD_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'

const CHIP_CLASS =
  'min-h-11 rounded-full border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900 sm:min-h-9'

export interface TriageDecisionPatch {
  note?: string
  reasonCode?: KnowledgeBitRejectReason | null
}

function DecisionItem({
  decision,
  card,
  readOnly,
  onEdit,
}: {
  decision: TriageDecision
  card: TriageDecisionResponse | undefined
  readOnly: boolean
  onEdit: (bitId: string, patch: TriageDecisionPatch) => void
}) {
  const { bitId } = decision

  return (
    <li data-testid={`triage-decision-${bitId}`} className="space-y-2 rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium">{card?.front ?? 'Card text unavailable'}</p>
      {card?.back ? <p className="text-sm text-neutral-600">{card.back}</p> : null}
      <textarea
        data-testid={`triage-decision-note-${bitId}`}
        aria-label="Note for this card"
        rows={2}
        disabled={readOnly}
        maxLength={KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS}
        value={decision.note ?? ''}
        onChange={(event) => onEdit(bitId, { note: event.target.value })}
        className={TEXT_FIELD_CLASS}
      />
      {decision.verdict === 'rejected' ? (
        <div className="flex flex-wrap gap-2">
          {KNOWLEDGE_BIT_REJECT_REASONS.map((reason) => {
            const chosen = decision.reasonCode === reason

            return (
              <button
                key={reason}
                type="button"
                data-testid={`triage-decision-reason-${bitId}-${reason}`}
                aria-pressed={chosen}
                disabled={readOnly}
                onClick={() => onEdit(bitId, { reasonCode: chosen ? null : reason })}
                className={`${CHIP_CLASS} ${chosen ? 'bg-neutral-900 text-white hover:bg-neutral-900' : ''}`}
              >
                {KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason]}
              </button>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

function DecisionGroup({
  title,
  testId,
  open,
  decisions,
  cards,
  readOnly,
  onEdit,
}: {
  title: string
  testId: string
  open: boolean
  decisions: TriageDecision[]
  cards: Record<string, TriageDecisionResponse>
  readOnly: boolean
  onEdit: (bitId: string, patch: TriageDecisionPatch) => void
}) {
  if (decisions.length === 0) {
    return null
  }

  return (
    <details data-testid={testId} open={open} className="rounded-md border border-neutral-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {title} ({decisions.length})
      </summary>
      <ul className="mt-3 space-y-3">
        {decisions.map((decision) => (
          <DecisionItem
            key={decision.bitId}
            decision={decision}
            card={cards[decision.bitId]}
            readOnly={readOnly}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </details>
  )
}

export function TriageDecisionsList({
  decisions,
  cards,
  readOnly = false,
  onEdit,
}: {
  decisions: TriageDecision[]
  cards: Record<string, TriageDecisionResponse>
  readOnly?: boolean
  onEdit: (bitId: string, patch: TriageDecisionPatch) => void
}) {
  if (decisions.length === 0) {
    return null
  }

  return (
    <div data-testid="triage-decisions-list" className="space-y-3">
      <DecisionGroup
        title="Rejected"
        testId="triage-decisions-rejected"
        open
        decisions={decisions.filter((decision) => decision.verdict === 'rejected')}
        cards={cards}
        readOnly={readOnly}
        onEdit={onEdit}
      />
      <DecisionGroup
        title="Accepted"
        testId="triage-decisions-accepted"
        open={false}
        decisions={decisions.filter((decision) => decision.verdict === 'approved')}
        cards={cards}
        readOnly={readOnly}
        onEdit={onEdit}
      />
    </div>
  )
}
