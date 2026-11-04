import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { MoveToChatQueueResult, ReturnFromChatQueueResult } from '@post-anki/shared'

import * as api from './knowledge-bit-chat-move.api-client'

const bitIdInput = z.object({ bitId: z.string().min(1) })

export const moveKnowledgeBitToChatQueueForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(
    ({ data }): Promise<MoveToChatQueueResult> => api.moveKnowledgeBitToChatQueue(data.bitId),
  )

export const returnKnowledgeBitFromChatQueueForReview = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => bitIdInput.parse(data))
  .handler(
    ({ data }): Promise<ReturnFromChatQueueResult> =>
      api.returnKnowledgeBitFromChatQueue(data.bitId),
  )
