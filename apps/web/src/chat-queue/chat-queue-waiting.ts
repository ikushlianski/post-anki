import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

export type ChatQueueSortOrder = 'oldest' | 'newest'

const DAY_MS = 86_400_000

export const STALE_CHAT_DAYS = 14

export function chatWaitingDays(chatAt: string, now: Date): number {
  const elapsed = now.getTime() - new Date(chatAt).getTime()

  if (!Number.isFinite(elapsed)) return 0

  return Math.max(0, Math.floor(elapsed / DAY_MS))
}

export function formatChatWaiting(days: number): string {
  if (days <= 0) return 'waiting today'
  if (days === 1) return 'waiting 1 day'

  return `waiting ${days} days`
}

export function sortChatQueue(
  items: ChatQueueKnowledgeBit[],
  order: ChatQueueSortOrder,
): ChatQueueKnowledgeBit[] {
  const direction = order === 'oldest' ? 1 : -1

  return [...items].sort(
    (a, b) => direction * (new Date(a.chatAt).getTime() - new Date(b.chatAt).getTime()),
  )
}

export function staleChatIds(items: ChatQueueKnowledgeBit[], now: Date): string[] {
  return items
    .filter((item) => chatWaitingDays(item.chatAt, now) > STALE_CHAT_DAYS)
    .map((item) => item.id)
}
