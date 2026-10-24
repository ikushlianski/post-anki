import { createServerFn } from '@tanstack/react-start'
import { knowledgeDeletionResponseSchema } from '@post-anki/shared'
import type { KnowledgeDeletionResponse } from '@post-anki/shared'
import { z } from 'zod'

import { ApiError, request } from '../curriculum/api-client'

export type DeleteKnowledgeSourceOutcome =
  | ({ ok: true } & KnowledgeDeletionResponse)
  | { ok: false; error: string }

const deleteKnowledgeSourceInput = z.object({ id: z.string().min(1) })

export const deleteKnowledgeSourceById = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => deleteKnowledgeSourceInput.parse(data))
  .handler(async ({ data }): Promise<DeleteKnowledgeSourceOutcome> => {
    try {
      const body = await request<unknown>(`/knowledge-sources/${encodeURIComponent(data.id)}`, {
        method: 'DELETE',
      })

      return { ok: true, ...knowledgeDeletionResponseSchema.parse(body) }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.code ?? 'unknown' }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  })
