import { createServerFn } from '@tanstack/react-start'
import {
  askStudyChatInput,
  type AskStudyChatResult,
} from '@post-anki/shared'

import * as api from './api-client'

export const askStudyChat = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => askStudyChatInput.parse(data))
  .handler(
    ({ data }): Promise<AskStudyChatResult | null> =>
      api.askStudyChat(data),
  )
