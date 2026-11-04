import { chatQueueFailureFromThrown, type ChatQueueOutcome } from './chat-queue-failure'

export interface ChatLine {
  id: string
  isUser: boolean
  text: string
  seq?: number
}

export interface ThreadMessage {
  seq: number
  role: string
  text: string
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
  }))
}

export function withReplySeq(
  lines: ChatLine[],
  lineId: string,
  messages: ThreadMessage[],
): ChatLine[] {
  const lastReply = messages.filter((message) => message.role === 'assistant').at(-1)

  if (!lastReply) {
    return lines
  }

  return lines.map((line) => (line.id === lineId ? { ...line, seq: lastReply.seq } : line))
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
