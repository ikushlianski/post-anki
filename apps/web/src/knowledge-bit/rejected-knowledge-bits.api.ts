import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { rejectedCardsPageSchema, rejectedCardsQuerySchema } from '@post-anki/shared'
import type { RejectedCardsPage, RejectedCardsQuery } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type RejectedCardsOutcome =
  | ({ ok: true } & RejectedCardsPage)
  | { ok: false; error: string }

function toFailure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.code ?? 'unknown' }
  }

  return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
}

export const listRejectedKnowledgeBits = createServerFn({ method: 'GET' })
  .inputValidator((data: Partial<RejectedCardsQuery>) => rejectedCardsQuerySchema.parse(data))
  .handler(async ({ data }): Promise<RejectedCardsOutcome> => {
    const params = new URLSearchParams({ limit: String(data.limit), offset: String(data.offset) })

    if (data.reason) {
      params.set('reason', data.reason)
    }

    if (data.subjectId) {
      params.set('subjectId', data.subjectId)
    }

    if (data.q) {
      params.set('q', data.q)
    }

    try {
      const body = await request<unknown>(`/knowledge-bits/rejected?${params.toString()}`)

      return { ok: true, ...rejectedCardsPageSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })

export type RestoreRejectedOutcome = { ok: true } | { ok: false; reason: 'not_found' | 'not_rejected' | 'failed' }

export const restoreRejectedKnowledgeBit = createServerFn({ method: 'POST' })
  .inputValidator((data: { bitId: string }) => z.object({ bitId: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<RestoreRejectedOutcome> => {
    try {
      await request<unknown>(`/knowledge-bits/${encodeURIComponent(data.bitId)}/restore-rejected`, { method: 'POST' })

      return { ok: true }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { ok: false, reason: 'not_found' }
      }

      if (err instanceof ApiError && err.status === 409) {
        return { ok: false, reason: 'not_rejected' }
      }

      return { ok: false, reason: 'failed' }
    }
  })
