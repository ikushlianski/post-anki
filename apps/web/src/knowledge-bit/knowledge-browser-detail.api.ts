import { createServerFn } from '@tanstack/react-start'
import { knowledgeBitDetailSchema } from '@post-anki/shared'
import type { KnowledgeBitDetail } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type KnowledgeBrowserDetailOutcome =
  | { ok: true; detail: KnowledgeBitDetail }
  | { ok: false; error: 'not_found' | string }

export const getKnowledgeBrowserDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => {
    if (typeof data.id !== 'string' || data.id === '') {
      throw new Error('A piece id is required')
    }

    return { id: data.id }
  })
  .handler(async ({ data }): Promise<KnowledgeBrowserDetailOutcome> => {
    try {
      const body = await request<unknown>(`/knowledge-bits/${encodeURIComponent(data.id)}`)

      return { ok: true, detail: knowledgeBitDetailSchema.parse(body) }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.status === 404 ? 'not_found' : (err.code ?? 'unknown') }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  })
