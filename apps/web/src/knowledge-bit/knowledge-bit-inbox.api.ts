import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  DiscardFromInboxResult,
  InboxKnowledgeBitList,
  MoveToInboxResult,
  ReturnFromInboxResult,
} from '@post-anki/shared'

import * as api from './knowledge-bit-inbox.api-client'

const bitIdInput = z.object({ bitId: z.string().min(1) })
const exampleInput = bitIdInput.extend({ overwrite: z.boolean().optional() })

export const moveKnowledgeBitToInboxForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(({ data }): Promise<MoveToInboxResult> => api.moveKnowledgeBitToInbox(data.bitId))

export const returnKnowledgeBitFromInboxForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(
    ({ data }): Promise<ReturnFromInboxResult> => api.returnKnowledgeBitFromInbox(data.bitId),
  )

export const discardKnowledgeBitFromInboxForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(
    ({ data }): Promise<DiscardFromInboxResult> => api.discardKnowledgeBitFromInbox(data.bitId),
  )

export const getInboxKnowledgeBits = createServerFn({ method: 'GET' }).handler(
  (): Promise<InboxKnowledgeBitList> => api.listInboxKnowledgeBits(),
)

export const generateKnowledgeBitExampleForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => exampleInput.parse(data))
  .handler(({ data }) => api.generateKnowledgeBitExample(data.bitId, data.overwrite ?? false))
