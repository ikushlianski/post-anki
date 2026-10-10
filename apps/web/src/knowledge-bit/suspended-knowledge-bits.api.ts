import { createServerFn } from '@tanstack/react-start'
import {
  suspendedCardsPageSchema,
  suspendedCardsQuerySchema,
} from '@post-anki/shared'
import type { SuspendedCardsPage, SuspendedCardsQuery } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type SuspendedCardsOutcome =
  | ({ ok: true } & SuspendedCardsPage)
  | { ok: false; error: string }

function toFailure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.code ?? 'unknown' }
  }

  return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
}

export const listSuspendedKnowledgeBits = createServerFn({ method: 'GET' })
  .inputValidator((data: Partial<SuspendedCardsQuery>) => suspendedCardsQuerySchema.parse(data))
  .handler(async ({ data }): Promise<SuspendedCardsOutcome> => {
    const params = new URLSearchParams({ limit: String(data.limit), offset: String(data.offset) })

    try {
      const body = await request<unknown>(`/knowledge-bits/suspended?${params.toString()}`)

      return { ok: true, ...suspendedCardsPageSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })
