import { useEffect, useRef } from 'react'
import type { ChatQueueProposal } from '@post-anki/shared'

import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '../knowledge-bit/knowledge-bit-review-classes'
import type { ProposalDecision, ProposalStatus } from './use-chat-proposals'
import { useHorizontalSwipe } from './use-horizontal-swipe'

interface Props {
  lineId: string
  seq: number | undefined
  proposals: ChatQueueProposal[]
  statusOf: (lineId: string, index: number) => ProposalStatus
  onDecide: (
    lineId: string,
    seq: number,
    proposal: ChatQueueProposal,
    decision: ProposalDecision,
  ) => void
}

interface CardProps {
  lineId: string
  seq: number | undefined
  proposal: ChatQueueProposal
  status: ProposalStatus
  onDecide: Props['onDecide']
}

function ProposalCard({ lineId, seq, proposal, status, onDecide }: CardProps) {
  const { index } = proposal
  const pending = proposal.status === 'pending'
  const busy = seq === undefined || status.state === 'saving'
  const decide = (decision: ProposalDecision) => {
    if (seq !== undefined && pending) {
      onDecide(lineId, seq, proposal, decision)
    }
  }
  const swipe = useHorizontalSwipe({ enabled: pending && !busy, onSwipe: decide })
  const kindLabel = proposal.kind === 'update' ? 'Update to this card' : 'New card'
  const decidedRef = useRef<HTMLParagraphElement>(null)
  const wasPending = useRef(pending)

  useEffect(() => {
    if (wasPending.current && proposal.status === 'accepted') {
      decidedRef.current?.focus()
    }

    wasPending.current = pending
  }, [pending, proposal.status])

  return (
    <div
      {...swipe}
      role="group"
      aria-label={`${kindLabel}: ${proposal.front}`}
      data-testid={`chat-queue-proposal-${index}`}
      className="space-y-1 rounded-lg border border-neutral-200 p-3"
    >
      <p className="text-xs text-neutral-500">
        {kindLabel}
      </p>
      <p className="text-sm font-medium whitespace-pre-wrap">{proposal.front}</p>
      <p className="text-sm whitespace-pre-wrap">{proposal.back}</p>
      {proposal.example ? (
        <p className="text-xs text-neutral-500 whitespace-pre-wrap">{proposal.example}</p>
      ) : null}
      {proposal.reason ? (
        <p className="text-xs text-neutral-500 whitespace-pre-wrap">{proposal.reason}</p>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`chat-queue-proposal-accept-${index}`}
            aria-label={`Accept ${kindLabel.toLowerCase()}: ${proposal.front}`}
            disabled={busy}
            onClick={() => decide('accept')}
            className={PRIMARY_BUTTON_CLASS}
          >
            Accept
          </button>
          <button
            type="button"
            data-testid={`chat-queue-proposal-reject-${index}`}
            aria-label={`Reject ${kindLabel.toLowerCase()}: ${proposal.front}`}
            disabled={busy}
            onClick={() => decide('reject')}
            className={SECONDARY_BUTTON_CLASS}
          >
            Reject
          </button>
          <span className="text-xs text-neutral-500">or swipe right to accept, left to reject</span>
        </div>
      ) : (
        <p
          ref={decidedRef}
          role="status"
          tabIndex={-1}
          data-testid={`chat-queue-proposal-${proposal.status}-${index}`}
          className="text-xs text-neutral-500"
        >
          {proposal.status === 'accepted'
            ? proposal.kind === 'update'
              ? 'Card updated'
              : 'Added to approved cards'
            : 'Rejected'}
        </p>
      )}
      {status.state === 'error' ? (
        <p role="alert" data-testid={`chat-queue-proposal-error-${index}`} className="text-sm text-red-700">
          {status.message}
        </p>
      ) : null}
    </div>
  )
}

export function ChatQueueProposals({ lineId, seq, proposals, statusOf, onDecide }: Props) {
  return (
    <div data-testid="chat-queue-proposals" className="mt-2 space-y-2">
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.index}
          lineId={lineId}
          seq={seq}
          proposal={proposal}
          status={statusOf(lineId, proposal.index)}
          onDecide={onDecide}
        />
      ))}
    </div>
  )
}
