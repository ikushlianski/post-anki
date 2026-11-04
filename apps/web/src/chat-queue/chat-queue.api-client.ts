import type {
  DeleteLastChatExchangeResult,
  CreateCardFromChatMessageInput,
  CreateCardFromChatMessageResult,
  ChatQueueCount,
  ChatQueueKnowledgeBitList,
  ChatQueueSearchResponse,
  ChatQueueThread,
  KnowledgeBitRejectReason,
  ReturnFromChatQueueResult,
  SendChatQueueMessageInput,
  SendChatQueueMessageResult,
  SnoozeChatQueueResult,
} from '@post-anki/shared'

import { ApiError, apiBaseUrl, authHeaders, request } from '../curriculum/api-client'
import { chatQueueFailureFromApi, type ChatQueueOutcome } from './chat-queue-failure'

async function attempt<T>(call: () => Promise<T>): Promise<ChatQueueOutcome<T>> {
  try {
    return { ok: true, data: await call() }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, failure: chatQueueFailureFromApi(error.status, error.code) }
    }

    return { ok: false, failure: 'other' }
  }
}

export function listChatQueue(): Promise<ChatQueueOutcome<ChatQueueKnowledgeBitList>> {
  return attempt(() => request<ChatQueueKnowledgeBitList>('/knowledge-bits/chat-queue'))
}

export function countChatQueue(): Promise<ChatQueueOutcome<ChatQueueCount>> {
  return attempt(() => request<ChatQueueCount>('/knowledge-bits/chat-queue/count'))
}

export function searchChatQueue(q: string): Promise<ChatQueueOutcome<ChatQueueSearchResponse>> {
  return attempt(() =>
    request<ChatQueueSearchResponse>(`/knowledge-bits/chat-queue/search?q=${encodeURIComponent(q)}`),
  )
}

export function getChatQueueThread(bitId: string): Promise<ChatQueueOutcome<ChatQueueThread>> {
  return attempt(() => request<ChatQueueThread>(`/knowledge-bits/${bitId}/chat-messages`))
}

export function sendChatQueueMessage(
  bitId: string,
  input: SendChatQueueMessageInput,
): Promise<ChatQueueOutcome<SendChatQueueMessageResult>> {
  return attempt(() =>
    request<SendChatQueueMessageResult>(`/knowledge-bits/${bitId}/chat-messages`, {
      method: 'POST',
      body: input,
    }),
  )
}

export function deleteLastChatExchange(
  bitId: string,
): Promise<ChatQueueOutcome<DeleteLastChatExchangeResult>> {
  return attempt(() =>
    request<DeleteLastChatExchangeResult>(`/knowledge-bits/${bitId}/chat-queue/messages/last`, {
      method: 'DELETE',
    }),
  )
}

export function returnFromChatQueue(
  bitId: string,
): Promise<ChatQueueOutcome<ReturnFromChatQueueResult>> {
  return attempt(() =>
    request<ReturnFromChatQueueResult>(`/knowledge-bits/${bitId}/chat-queue`, {
      method: 'DELETE',
    }),
  )
}

export function approveFromChatQueue(bitId: string): Promise<ChatQueueOutcome<{ ok: true }>> {
  return attempt(() =>
    request<{ ok: true }>(`/knowledge-bits/${bitId}/approve`, { method: 'POST' }),
  )
}

export function rejectFromChatQueue(
  bitId: string,
): Promise<ChatQueueOutcome<{ ok: true; feedbackId: string | null }>> {
  return attempt(() =>
    request<{ ok: true; feedbackId: string | null }>(`/knowledge-bits/${bitId}/reject`, {
      method: 'POST',
    }),
  )
}

export function saveChatQueueRejectReason(
  feedbackId: string,
  reasonCode: KnowledgeBitRejectReason,
  note: string | undefined,
): Promise<ChatQueueOutcome<{ ok: true }>> {
  return attempt(() =>
    request<{ ok: true }>(`/knowledge-bit-feedback/${feedbackId}`, {
      method: 'PATCH',
      body: note ? { reasonCode, note } : { reasonCode },
    }),
  )
}

export function createCardFromChatMessage(
  bitId: string,
  seq: number,
  input: CreateCardFromChatMessageInput,
): Promise<ChatQueueOutcome<CreateCardFromChatMessageResult>> {
  return attempt(() =>
    request<CreateCardFromChatMessageResult>(`/knowledge-bits/${bitId}/chat-messages/${seq}/card`, {
      method: 'POST',
      body: input,
    }),
  )
}

export function snoozeChatQueueCard(
  bitId: string,
  days: number,
): Promise<ChatQueueOutcome<SnoozeChatQueueResult>> {
  return attempt(() =>
    request<SnoozeChatQueueResult>(`/knowledge-bits/${bitId}/chat-queue/snooze`, {
      method: 'POST',
      body: { days },
    }),
  )
}

export function unsnoozeChatQueueCard(
  bitId: string,
): Promise<ChatQueueOutcome<SnoozeChatQueueResult>> {
  return attempt(() =>
    request<SnoozeChatQueueResult>(`/knowledge-bits/${bitId}/chat-queue/snooze`, {
      method: 'DELETE',
    }),
  )
}

export type ChatQueueExportFile = { filename: string; markdown: string }

export async function exportChatQueueMarkdown(
  subjectId: string,
): Promise<ChatQueueOutcome<ChatQueueExportFile>> {
  const base = apiBaseUrl()

  if (!base) return { ok: false, failure: 'other' }

  try {
    const response = await fetch(
      `${base}/knowledge-bits/chat-queue/export?subjectId=${encodeURIComponent(subjectId)}`,
      { headers: authHeaders() },
    )

    if (!response.ok) {
      return { ok: false, failure: chatQueueFailureFromApi(response.status, undefined) }
    }

    const disposition = response.headers.get('content-disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'chat-export.md'

    return { ok: true, data: { filename, markdown: await response.text() } }
  } catch {
    return { ok: false, failure: 'other' }
  }
}
