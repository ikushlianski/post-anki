import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { askKnowledgeBitChatInput, type AskKnowledgeBitChatResult } from '@post-anki/shared'

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
