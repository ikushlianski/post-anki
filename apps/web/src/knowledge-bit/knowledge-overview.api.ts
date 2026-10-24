import { createServerFn } from '@tanstack/react-start'
import {
  bulkDeleteKnowledgeBitsInput,
  bulkDeleteKnowledgeBitsResponseSchema,
  bulkMoveKnowledgeBitsInput,
  bulkMoveKnowledgeBitsResponseSchema,
  knowledgeBitOverviewPageSchema,
  knowledgeBitOverviewQuerySchema,
} from '@post-anki/shared'
import type {
  BulkDeleteKnowledgeBitsInput,
  BulkDeleteKnowledgeBitsResponse,
  BulkMoveKnowledgeBitsInput,
  BulkMoveKnowledgeBitsResponse,
  KnowledgeBitOverviewPage,
  KnowledgeBitOverviewQuery,
} from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type KnowledgeOverviewOutcome =
  | ({ ok: true } & KnowledgeBitOverviewPage)
  | { ok: false; error: string }

export type DeleteKnowledgeBitsOutcome =
  | ({ ok: true } & BulkDeleteKnowledgeBitsResponse)
  | { ok: false; error: string }

export type MoveKnowledgeBitsOutcome =
  | ({ ok: true } & BulkMoveKnowledgeBitsResponse)
  | { ok: false; error: string }

function toFailure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.code ?? 'unknown' }
  }

  return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
}

export const listKnowledgeOverview = createServerFn({ method: 'GET' })
  .inputValidator((data: Partial<KnowledgeBitOverviewQuery>) =>
    knowledgeBitOverviewQuerySchema.parse(data),
  )
  .handler(async ({ data }): Promise<KnowledgeOverviewOutcome> => {
    const params = new URLSearchParams({ limit: String(data.limit), offset: String(data.offset) })

    if (data.subjectId) {
      params.set('subjectId', data.subjectId)
    }

    if (data.q) {
      params.set('q', data.q)
    }

    try {
      const body = await request<unknown>(`/knowledge-bits/overview?${params.toString()}`)

      return { ok: true, ...knowledgeBitOverviewPageSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })

export const moveKnowledgeBits = createServerFn({ method: 'POST' })
  .inputValidator((data: BulkMoveKnowledgeBitsInput) => bulkMoveKnowledgeBitsInput.parse(data))
  .handler(async ({ data }): Promise<MoveKnowledgeBitsOutcome> => {
    try {
      const body = await request<unknown>('/knowledge-bits/moves', {
        method: 'POST',
        body: data,
      })

      return { ok: true, ...bulkMoveKnowledgeBitsResponseSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })

export const deleteKnowledgeBits = createServerFn({ method: 'POST' })
  .inputValidator((data: BulkDeleteKnowledgeBitsInput) => bulkDeleteKnowledgeBitsInput.parse(data))
  .handler(async ({ data }): Promise<DeleteKnowledgeBitsOutcome> => {
    try {
      const body = await request<unknown>('/knowledge-bits/deletions', {
        method: 'POST',
        body: data,
      })

      return { ok: true, ...bulkDeleteKnowledgeBitsResponseSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })
