import type { Dispatch, SetStateAction } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  MAX_DRAFT_TRANSCRIPT_MESSAGES,
  type CardProposal,
  type ChatMessage,
} from '@post-anki/shared'

import type { PanelMessage } from './knowledge-bit-chat-messages'
import { draftKnowledgeBitChat } from './knowledge-bit-chat.api'

const CARD_FALLBACK_REPLY = 'Could not draft a card right now — try again.'

export function toTranscript(messages: PanelMessage[]): ChatMessage[] {
  return messages.flatMap((m) => (m.kind === 'text' ? [{ role: m.role, text: m.text }] : []))
}

export function useCardProposalRequests({
  knowledgeBitId,
  messages,
  allowWebSearch,
  setMessages,
}: {
  knowledgeBitId: string
  messages: PanelMessage[]
  allowWebSearch: boolean
  setMessages: Dispatch<SetStateAction<PanelMessage[]>>
}) {
  const cardMutation = useMutation({
    mutationFn: (vars: {
      instruction: string
      transcript: ChatMessage[]
      previous?: CardProposal
      allowWebSearch: boolean
    }) =>
      draftKnowledgeBitChat({
        data: {
          knowledgeBitId,
          mode: vars.previous ? 'edit' : 'create',
          transcript: vars.transcript.slice(-MAX_DRAFT_TRANSCRIPT_MESSAGES),
          instruction: vars.instruction,
          previous: vars.previous,
          allowWebSearch: vars.allowWebSearch,
        },
      }),
  })

  function requestCard(instruction: string, previous?: CardProposal) {
    cardMutation.mutate(
      {
        instruction,
        transcript: toTranscript(messages),
        previous,
        allowWebSearch,
      },
      {
        onSuccess: (result) => {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'card-proposal',
              id: `card-${Date.now()}`,
              card: result.card,
              status: 'proposed',
            },
          ])
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'text',
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              text: CARD_FALLBACK_REPLY,
            },
          ])
        },
      },
    )
  }

  return { cardMutation, requestCard }
}
