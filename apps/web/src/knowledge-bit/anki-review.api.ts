import { createServerFn } from '@tanstack/react-start'
import {
  recordReviewInputSchema,
  recordReviewResultSchema,
  reviewCardsQuerySchema,
  reviewCardsResponseSchema,
} from '@post-anki/shared'
import type {
  RecordReviewInput,
  RecordReviewResult,
  ReviewCard,
  ReviewCardsQuery,
} from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type ReviewCardsOutcome = { ok: true; cards: ReviewCard[] } | { ok: false; error: string }

export type SubmitReviewOutcome =
  | ({ ok: true } & RecordReviewResult)
  | { ok: false; error: string }

function toFailure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.code ?? 'unknown' }
  }

  return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
}

export const getReviewCards = createServerFn({ method: 'GET' })
  .inputValidator((data: Partial<ReviewCardsQuery>) => reviewCardsQuerySchema.parse(data))
  .handler(async ({ data }): Promise<ReviewCardsOutcome> => {
    const params = new URLSearchParams({ limit: String(data.limit) })

    for (const key of ['tagId', 'topicId', 'knowledgeBitId'] as const) {
      const value = data[key]

      if (value) {
        params.set(key, value)
      }
    }

    try {
      const body = await request<unknown>(`/knowledge-bits/review-cards?${params.toString()}`)

      return { ok: true, cards: reviewCardsResponseSchema.parse(body).cards }
    } catch (err) {
      return toFailure(err)
    }
  })

export const submitReview = createServerFn({ method: 'POST' })
  .inputValidator((data: RecordReviewInput) => recordReviewInputSchema.parse(data))
  .handler(async ({ data }): Promise<SubmitReviewOutcome> => {
    try {
      const body = await request<unknown>('/knowledge-bits/reviews', { method: 'POST', body: data })

      return { ok: true, ...recordReviewResultSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })
