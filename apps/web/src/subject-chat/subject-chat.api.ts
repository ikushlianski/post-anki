import { createServerFn } from '@tanstack/react-start'
import { askSubjectChatInput, type AskSubjectChatResult } from '@post-anki/shared'

import * as api from '../curriculum/api-client'

export const askSubjectChat = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => askSubjectChatInput.parse(data))
  .handler(
    ({ data }): Promise<AskSubjectChatResult | null> => api.askSubjectChat(data),
  )
