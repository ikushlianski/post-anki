import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  MAX_DRAFT_TRANSCRIPT_MESSAGES,
  type CardProposal,
  type ChatMessage,
} from '@post-anki/shared'

import { draftKnowledgeBitChat, createKnowledgeItemFromChat } from './knowledge-bit-chat.api'

export const REPLACEMENT_INSTRUCTION =
  'Write one replacement card that fixes the problems we discussed in this card.'

const BUTTON_CLASS = 'min-h-11 rounded-md px-4 text-sm font-medium disabled:opacity-50 sm:min-h-0 sm:px-3'

export function KnowledgeBitChatReplacement({
  knowledgeBitId,
  transcript,
  allowWebSearch,
  disabled,
  onAccepted,
}: {
  knowledgeBitId: string
  transcript: ChatMessage[]
  allowWebSearch: boolean
  disabled: boolean
  onAccepted: () => void
}) {
  const [proposal, setProposal] = useState<CardProposal | null>(null)

  const draftMutation = useMutation({
    mutationFn: () =>
      draftKnowledgeBitChat({
        data: {
          knowledgeBitId,
          mode: 'create',
          transcript: transcript.slice(-MAX_DRAFT_TRANSCRIPT_MESSAGES),
          instruction: REPLACEMENT_INSTRUCTION,
          allowWebSearch,
        },
      }),
    onSuccess: (result) => setProposal(result.card),
  })

  const acceptMutation = useMutation({
    mutationFn: (card: CardProposal) =>
      createKnowledgeItemFromChat({
        data: {
          knowledgeBitId,
          front: card.front.trim(),
          back: card.back.trim(),
          example: card.example?.trim() ? card.example.trim() : undefined,
          aiGenerated: card.usedWebSearch,
          sourceLinks: card.usedWebSearch ? card.sources : [],
        },
      }),
    onSuccess: () => onAccepted(),
  })

  if (acceptMutation.isSuccess) {
    return (
      <p
        data-testid="knowledge-bit-chat-replacement-created"
        className="shrink-0 border-t border-neutral-200 px-3 py-2 text-sm text-green-700"
      >
        Replacement saved, waiting in review
      </p>
    )
  }

  if (proposal) {
    return (
      <div
        data-testid="knowledge-bit-chat-replacement-proposal"
        className="shrink-0 space-y-2 border-t border-neutral-200 p-3 text-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Proposed replacement
        </p>
        <p data-testid="knowledge-bit-chat-replacement-front" className="whitespace-pre-wrap font-medium">
          {proposal.front}
        </p>
        <p data-testid="knowledge-bit-chat-replacement-back" className="whitespace-pre-wrap">
          {proposal.back}
        </p>
        {proposal.example ? (
          <p className="whitespace-pre-wrap text-neutral-500">{proposal.example}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="knowledge-bit-chat-replacement-accept"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate(proposal)}
            className={`${BUTTON_CLASS} bg-neutral-900 text-white`}
          >
            {acceptMutation.isPending ? 'Saving…' : 'Accept'}
          </button>
          <button
            type="button"
            data-testid="knowledge-bit-chat-replacement-ignore"
            disabled={acceptMutation.isPending}
            onClick={() => {
              acceptMutation.reset()
              setProposal(null)
            }}
            className={`${BUTTON_CLASS} border border-neutral-300 text-neutral-700`}
          >
            Ignore
          </button>
        </div>
        {acceptMutation.isError ? (
          <p role="alert" data-testid="knowledge-bit-chat-replacement-error" className="text-xs text-red-600">
            Could not save the replacement — try again.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-neutral-200 px-3 pt-2">
      <button
        type="button"
        data-testid="knowledge-bit-chat-replacement-chip"
        disabled={disabled || draftMutation.isPending}
        onClick={() => draftMutation.mutate()}
        className="min-h-11 rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 sm:min-h-0"
      >
        {draftMutation.isPending ? 'Drafting replacement…' : 'Suggest a replacement card'}
      </button>
      {draftMutation.isError ? (
        <p role="alert" data-testid="knowledge-bit-chat-replacement-draft-error" className="mt-1 text-xs text-red-600">
          Could not draft a replacement right now — try again.
        </p>
      ) : null}
    </div>
  )
}
