import { createServerFn } from '@tanstack/react-start'
import { phraseSplitResponseSchema } from '@post-anki/shared'
import type { PhraseSplitResponse } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type PhraseSplitOutcome =
  | ({ ok: true } & PhraseSplitResponse)
  | { ok: false; error: 'not_found' | string }

export const splitPhraseKnowledgeBit = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => {
    if (typeof data.id !== 'string' || data.id === '') {
      throw new Error('A card id is required')
    }

    return { id: data.id }
  })
  .handler(async ({ data }): Promise<PhraseSplitOutcome> => {
    try {
      const body = await request<unknown>(`/knowledge-bits/${encodeURIComponent(data.id)}/phrase-splits`, {
        method: 'POST',
      })

      return { ok: true, ...phraseSplitResponseSchema.parse(body) }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.status === 404 ? 'not_found' : (err.code ?? 'unknown') }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  })
