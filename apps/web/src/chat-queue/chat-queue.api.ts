import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  chatQueueSearchQuerySchema,
  knowledgeBitRejectReasonSchema,
  sendChatQueueMessageInput,
  snoozeChatQueueInput,
  KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS,
} from '@post-anki/shared'

import * as api from './chat-queue.api-client'

const bitIdInput = z.object({ bitId: z.string().min(1) })
const sendInput = bitIdInput.extend({ message: sendChatQueueMessageInput })
const proposalInput = bitIdInput.extend({
  seq: z.number().int().min(1),
  index: z.number().int().min(0),
})
const subjectInput = z.object({ subjectId: z.string().min(1) })
const snoozeInput = bitIdInput.merge(snoozeChatQueueInput)
const reasonInput = z.object({
  feedbackId: z.string().min(1),
  reasonCode: knowledgeBitRejectReasonSchema,
  note: z.string().trim().max(KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS).optional(),
})

export const getChatQueue = createServerFn({ method: 'GET' }).handler(() => api.listChatQueue())

export const getChatQueueCount = createServerFn({ method: 'GET' }).handler(() =>
  api.countChatQueue(),
)

export const searchChatQueue = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => chatQueueSearchQuerySchema.parse(data))
  .handler(({ data }) => api.searchChatQueue(data.q))

export const getChatQueueThread = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.getChatQueueThread(data.bitId))

export const sendChatQueueMessage = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => sendInput.parse(data))
  .handler(({ data }) => api.sendChatQueueMessage(data.bitId, data.message))

export const deleteLastChatExchange = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.deleteLastChatExchange(data.bitId))

export const returnFromChatQueue = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.returnFromChatQueue(data.bitId))

export const cancelChatQueueThread = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.cancelChatQueueThread(data.bitId))

export const approveFromChatQueue = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.approveFromChatQueue(data.bitId))

export const rejectFromChatQueue = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.rejectFromChatQueue(data.bitId))

export const saveChatQueueRejectReason = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => reasonInput.parse(data))
  .handler(({ data }) =>
    api.saveChatQueueRejectReason(data.feedbackId, data.reasonCode, data.note),
  )

export const acceptChatQueueProposal = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => proposalInput.parse(data))
  .handler(({ data }) => api.acceptChatQueueProposal(data.bitId, data.seq, data.index))

export const rejectChatQueueProposal = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => proposalInput.parse(data))
  .handler(({ data }) => api.rejectChatQueueProposal(data.bitId, data.seq, data.index))

export const snoozeChatQueueCard = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => snoozeInput.parse(data))
  .handler(({ data }) => api.snoozeChatQueueCard(data.bitId, data.days))

export const unsnoozeChatQueueCard = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }) => api.unsnoozeChatQueueCard(data.bitId))

export const exportChatQueueMarkdown = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => subjectInput.parse(data))
  .handler(({ data }) => api.exportChatQueueMarkdown(data.subjectId))
