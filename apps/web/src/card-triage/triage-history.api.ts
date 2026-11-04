import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  patchTriageDecisionInput,
  triageDecisionResponse,
  triageHistoryQuery,
  triageHistoryResponse,
  type TriageDecisionResponse,
  type TriageHistoryResponse,
} from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'
import type { TriageOutcome } from './card-triage.api'

async function run<T>(call: () => Promise<T>): Promise<TriageOutcome<T>> {
  try {
    return { ok: true, data: await call() }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.code ?? 'unknown', status: err.status }
    }

    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export const listRecentTriageDecisions = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => triageHistoryQuery.parse(data ?? {}))
  .handler(({ data }): Promise<TriageOutcome<TriageHistoryResponse>> =>
    run(async () => {
      const params = new URLSearchParams({ days: String(data.days), mode: data.mode })

      if (data.q) {
        params.set('q', data.q)
      }

      return triageHistoryResponse.parse(
        await request<unknown>(`/triage-decisions/recent?${params.toString()}`),
      )
    }),
  )

const patchInput = z.object({ decisionId: z.string().min(1) }).and(patchTriageDecisionInput)

export const patchTriageDecision = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => patchInput.parse(data))
  .handler(({ data }): Promise<TriageOutcome<TriageDecisionResponse>> => {
    const { decisionId, ...body } = data

    return run(async () =>
      triageDecisionResponse.parse(
        await request<unknown>(`/triage-decisions/${encodeURIComponent(decisionId)}`, {
          method: 'PATCH',
          body,
        }),
      ),
    )
  })
