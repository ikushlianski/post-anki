import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  askKnowledgeBitChatInput,
  createManualKnowledgeItemInput,
  draftKnowledgeBitChatInput,
  type AskKnowledgeBitChatResult,
  type DraftKnowledgeBitChatResult,
  type PendingKnowledgeBitForReview,
} from '@post-anki/shared'

import * as api from '../curriculum/api-client'

const askKnowledgeBitChatServerInput = askKnowledgeBitChatInput.extend({
  knowledgeBitId: z.string().min(1),
})

export const askKnowledgeBitChat = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => askKnowledgeBitChatServerInput.parse(data))
  .handler(
    ({ data }): Promise<AskKnowledgeBitChatResult | null> =>
      api.askKnowledgeBitChat(data.knowledgeBitId, data),
  )

const draftKnowledgeBitChatServerInput = draftKnowledgeBitChatInput.extend({
  knowledgeBitId: z.string().min(1),
})

export const draftKnowledgeBitChat = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => draftKnowledgeBitChatServerInput.parse(data))
  .handler(
    ({ data }): Promise<DraftKnowledgeBitChatResult> =>
      api.draftKnowledgeBitChat(data.knowledgeBitId, {
        mode: data.mode,
        transcript: data.transcript,
        instruction: data.instruction,
        previous: data.previous,
        allowWebSearch: data.allowWebSearch,
      }),
  )

const createChatKnowledgeItemServerInput = z
  .object({ knowledgeBitId: z.string().min(1) })
  .and(createManualKnowledgeItemInput)

export const createKnowledgeItemFromChat = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createChatKnowledgeItemServerInput.parse(data))
  .handler(
    ({ data }): Promise<PendingKnowledgeBitForReview> =>
      api.createDerivedKnowledgeItem(data.knowledgeBitId, {
        front: data.front,
        back: data.back,
        example: data.example,
        aiGenerated: data.aiGenerated,
        sourceLinks: data.sourceLinks,
      }),
  )
