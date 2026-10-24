import { createServerFn } from '@tanstack/react-start'
import { knowledgeDeletionResponseSchema, purgeKnowledgeBitsInput } from '@post-anki/shared'
import type { KnowledgeDeletionResponse, PurgeKnowledgeBitsInput } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type PurgeKnowledgeBitsOutcome =
  | ({ ok: true } & KnowledgeDeletionResponse)
  | { ok: false; error: string }

export const purgeKnowledgeBits = createServerFn({ method: 'POST' })
  .inputValidator((data: PurgeKnowledgeBitsInput) => purgeKnowledgeBitsInput.parse(data))
  .handler(async ({ data }): Promise<PurgeKnowledgeBitsOutcome> => {
    try {
      const body = await request<unknown>('/knowledge-bits/purges', { method: 'POST', body: data })

      return { ok: true, ...knowledgeDeletionResponseSchema.parse(body) }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.code ?? 'unknown' }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  })
