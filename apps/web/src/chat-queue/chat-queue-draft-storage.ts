import { CHAT_QUEUE_MAX_MESSAGE_CHARS } from '@post-anki/shared'

export const CHAT_QUEUE_DRAFT_PREFIX = 'chat-queue-draft:'

function keyFor(cardId: string): string {
  return `${CHAT_QUEUE_DRAFT_PREFIX}${cardId}`
}

export function loadChatDraft(cardId: string): string {
  try {
    const stored = window.localStorage.getItem(keyFor(cardId))

    return stored ? stored.slice(0, CHAT_QUEUE_MAX_MESSAGE_CHARS) : ''
  } catch {
    return ''
  }
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const clearedCards = new Set<string>()

export function cancelPendingChatDraft(cardId: string): void {
  const timer = pendingTimers.get(cardId)

  if (timer) {
    clearTimeout(timer)
    pendingTimers.delete(cardId)
  }
}

export function clearChatDraft(cardId: string): void {
  cancelPendingChatDraft(cardId)
  clearedCards.add(cardId)

  try {
    window.localStorage.removeItem(keyFor(cardId))
  } catch {
    return
  }
}

export function saveChatDraft(cardId: string, draft: string): void {
  if (!draft) {
    clearChatDraft(cardId)

    return
  }

  try {
    window.localStorage.setItem(keyFor(cardId), draft.slice(0, CHAT_QUEUE_MAX_MESSAGE_CHARS))
  } catch {
    return
  }
}

export function scheduleChatDraftSave(cardId: string, draft: string, delayMs: number): void {
  cancelPendingChatDraft(cardId)

  if (draft) {
    clearedCards.delete(cardId)
  }

  pendingTimers.set(
    cardId,
    setTimeout(() => {
      pendingTimers.delete(cardId)
      saveChatDraft(cardId, draft)
    }, delayMs),
  )
}

export function flushChatDraft(cardId: string, draft: string): void {
  cancelPendingChatDraft(cardId)

  if (!draft || clearedCards.has(cardId)) {
    return
  }

  saveChatDraft(cardId, draft)
}
