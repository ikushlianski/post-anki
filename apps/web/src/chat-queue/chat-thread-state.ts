import type { ChatQueueProposal } from '@post-anki/shared'

import { chatQueueFailureFromThrown, type ChatQueueOutcome } from './chat-queue-failure'

export interface ChatLine {
  id: string
  isUser: boolean
  text: string
  seq?: number
  proposals?: ChatQueueProposal[]
}

export interface ThreadMessage {
  seq: number
  role: string
  text: string
  proposals?: ChatQueueProposal[]
}

export function dropLastExchange(lines: ChatLine[]): ChatLine[] {
  const index = lines.map((line) => line.isUser).lastIndexOf(true)

  return index === -1 ? lines : lines.slice(0, index)
}

export function toChatLines(messages: ThreadMessage[]): ChatLine[] {
  return messages.map((message) => ({
    id: `m${message.seq}`,
    seq: message.seq,
    isUser: message.role === 'user',
    text: message.text,
    ...(message.proposals?.length ? { proposals: message.proposals } : {}),
  }))
}

export function withProposalDecision(
  lines: ChatLine[],
  lineId: string,
  index: number,
  decision: Pick<ChatQueueProposal, 'status' | 'savedCardId'>,
): ChatLine[] {
  return lines.map((line) =>
    line.id === lineId
      ? {
          ...line,
          proposals: line.proposals?.map((proposal) =>
            proposal.index === index ? { ...proposal, ...decision } : proposal,
          ),
        }
      : line,
  )
}

export function restoreDraft(previous: string, text: string, keepDraft: boolean): string {
  return keepDraft && previous.trim() ? `${text}\n\n${previous}` : text
}

export async function settle<T>(
  call: () => Promise<ChatQueueOutcome<T>>,
): Promise<ChatQueueOutcome<T>> {
  try {
    return await call()
  } catch {
    return { ok: false, failure: chatQueueFailureFromThrown() }
  }
}
