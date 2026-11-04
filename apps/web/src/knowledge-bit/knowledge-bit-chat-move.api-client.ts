import type { MoveToChatQueueResult, ReturnFromChatQueueResult } from '@post-anki/shared'

import { request } from '../curriculum/api-client'

export function moveKnowledgeBitToChatQueue(bitId: string): Promise<MoveToChatQueueResult> {
  return request<MoveToChatQueueResult>(`/knowledge-bits/${bitId}/chat-queue`, { method: 'POST' })
}

export function returnKnowledgeBitFromChatQueue(
  bitId: string,
): Promise<ReturnFromChatQueueResult> {
  return request<ReturnFromChatQueueResult>(`/knowledge-bits/${bitId}/chat-queue`, {
    method: 'DELETE',
  })
}
