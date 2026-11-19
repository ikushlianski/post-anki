import { createServerFn } from '@tanstack/react-start'
import { recordReviewInputSchema, recordReviewResultSchema, reviewPackQuerySchema, reviewPackSchema } from '@post-anki/shared'
import type { ReviewPack } from '@post-anki/shared'
import { z } from 'zod'

import { ApiError, request } from '../curriculum/api-client'
import type { SendOutcome } from './offline-review-types'

const RETRYABLE_STATUSES = new Set([401, 408, 429])

export function classifySyncFailure(error: unknown): SendOutcome {
  if (error instanceof ApiError) {
    return error.status >= 500 || RETRYABLE_STATUSES.has(error.status) ? 'retry' : 'rejected'
  }

  return 'retry'
}

export const fetchReviewPack = createServerFn({ method: 'GET' })
  .inputValidator((data: { tz: string }) => reviewPackQuerySchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true; pack: ReviewPack } | { ok: false }> => {
    try {
      const body = await request<unknown>(`/knowledge-bits/review-packs/current?tz=${encodeURIComponent(data.tz)}`)

      return { ok: true, pack: reviewPackSchema.parse(body) }
    } catch {
      return { ok: false }
    }
  })

export const syncQueuedGrade = createServerFn({ method: 'POST' })
  .inputValidator((data: z.input<typeof recordReviewInputSchema>) => recordReviewInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ outcome: SendOutcome; reviewId?: string }> => {
    try {
      const body = await request<unknown>('/knowledge-bits/reviews', {
        method: 'POST',
        body: { ...data, sentAt: new Date().toISOString() },
      })
      const parsed = recordReviewResultSchema.safeParse(body)

      return parsed.success ? { outcome: 'confirmed', reviewId: parsed.data.reviewId } : { outcome: 'confirmed' }
    } catch (error) {
      return { outcome: classifySyncFailure(error) }
    }
  })
