import { createServerFn } from '@tanstack/react-start'
import { cardQualityByModelResponse, type CardQualityByModelResponse } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'
import type { TriageOutcome } from './card-triage.api'

export const getCardQualityByModel = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TriageOutcome<CardQualityByModelResponse>> => {
    try {
      return {
        ok: true,
        data: cardQualityByModelResponse.parse(await request<unknown>('/card-quality/models')),
      }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.code ?? 'unknown', status: err.status }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  },
)
