import type { ChatQueueSortOrder } from './chat-queue-waiting'

export const CHAT_QUEUE_ORDER_KEY = 'chat-queue-order'

export function loadChatQueueOrder(): ChatQueueSortOrder {
  try {
    const stored = window.localStorage.getItem(CHAT_QUEUE_ORDER_KEY)

    return stored === 'newest' ? 'newest' : 'oldest'
  } catch {
    return 'oldest'
  }
}

export function saveChatQueueOrder(order: ChatQueueSortOrder): void {
  try {
    window.localStorage.setItem(CHAT_QUEUE_ORDER_KEY, order)
  } catch {
    return
  }
}
