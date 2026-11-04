import { createServerFn } from '@tanstack/react-start'

import type { ChatUsage } from '@post-anki/shared'
import * as api from '../curriculum/api-client'

export const getChatUsage = createServerFn({ method: 'GET' }).handler(
  (): Promise<ChatUsage> => api.getChatUsage(),
)
