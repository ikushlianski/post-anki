import type { CardProposal } from '@post-anki/shared'

export type CardProposalStatus = 'proposed' | 'saved' | 'rejected'

export interface TextChatMessage {
  kind: 'text'
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface CardProposalChatMessage {
  kind: 'card-proposal'
  id: string
  card: CardProposal
  status: CardProposalStatus
}

export type PanelMessage = TextChatMessage | CardProposalChatMessage

const CARD_REQUEST_PATTERN = /^\s*(card:|make a card)/i

export function isCardRequest(text: string): boolean {
  return CARD_REQUEST_PATTERN.test(text)
}

export function latestCardProposal(messages: PanelMessage[]): CardProposalChatMessage | null {
  const cards = messages.filter(
    (message): message is CardProposalChatMessage => message.kind === 'card-proposal',
  )

  return cards[cards.length - 1] ?? null
}
