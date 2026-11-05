import type { RelatedCardSuggestion } from '@post-anki/shared'

import { PRIMARY_BUTTON_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'
import type { ProposalStatus } from './use-chat-proposals'

interface Props {
  lineId: string
  seq: number | undefined
  proposals: RelatedCardSuggestion[]
  statusOf: (lineId: string, index: number) => ProposalStatus
  onApprove: (lineId: string, seq: number, index: number, proposal: RelatedCardSuggestion) => void
}

export function ChatQueueProposals({ lineId, seq, proposals, statusOf, onApprove }: Props) {
  return (
    <div data-testid="chat-queue-proposals" className="mt-2 space-y-2">
      {proposals.map((proposal, index) => {
        const status = statusOf(lineId, index)

        return (
          <div
            key={`${proposal.front}-${index}`}
            data-testid={`chat-queue-proposal-${index}`}
            className="space-y-1 rounded-lg border border-neutral-200 p-3"
          >
            <p className="text-sm font-medium whitespace-pre-wrap">{proposal.front}</p>
            <p className="text-sm whitespace-pre-wrap">{proposal.back}</p>
            {proposal.example ? (
              <p className="text-xs text-neutral-500 whitespace-pre-wrap">{proposal.example}</p>
            ) : null}
            {status.state === 'approved' ? (
              <p data-testid={`chat-queue-proposal-approved-${index}`} className="text-xs text-neutral-500">
                Added to approved cards
              </p>
            ) : (
              <button
                type="button"
                data-testid={`chat-queue-proposal-approve-${index}`}
                disabled={seq === undefined || status.state === 'saving'}
                onClick={() => seq !== undefined && onApprove(lineId, seq, index, proposal)}
                className={PRIMARY_BUTTON_CLASS}
              >
                Approve
              </button>
            )}
            {status.state === 'error' ? (
              <p role="alert" data-testid={`chat-queue-proposal-error-${index}`} className="text-sm text-red-700">
                {status.message}
              </p>
            ) : null}
          </div>
        )
      })}
      <p className="text-xs text-neutral-500">Or keep chatting to refine</p>
    </div>
  )
}
