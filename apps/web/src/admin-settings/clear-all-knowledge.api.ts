import { createServerFn } from '@tanstack/react-start'

import {
  CLEAR_ALL_KNOWLEDGE_CONFIRMATION,
  type KnowledgeDeletionCounts,
} from '@post-anki/shared'
import { request } from '../curriculum/api-client'

export const clearAllKnowledge = createServerFn({ method: 'POST' }).handler(
  async (): Promise<{ counts: KnowledgeDeletionCounts }> =>
    request<{ counts: KnowledgeDeletionCounts }>('/knowledge/purges', {
      method: 'POST',
      body: { confirm: CLEAR_ALL_KNOWLEDGE_CONFIRMATION },
    }),
)
