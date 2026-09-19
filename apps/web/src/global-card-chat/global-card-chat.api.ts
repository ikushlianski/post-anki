import { createServerFn } from '@tanstack/react-start'
import { askGlobalCardChatInput, type AskGlobalCardChatResult } from '@post-anki/shared'

import * as api from '../curriculum/api-client'

export const askGlobalCardChat = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => askGlobalCardChatInput.parse(data))
  .handler(
    ({ data }): Promise<AskGlobalCardChatResult | null> =>
      api.askGlobalCardChat(data),
  )
