import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  decideRewordedDraftInputSchema,
  rewordedDraftListResponse,
  type RewordedDraft,
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

export const listRewordedDrafts = createServerFn({ method: 'GET' }).handler(
  (): Promise<TriageOutcome<RewordedDraft[]>> =>
    run(async () => rewordedDraftListResponse.parse(await request<unknown>('/reworded-drafts')).drafts),
)

const decideInput = z
  .object({ draftId: z.string().min(1) })
  .and(decideRewordedDraftInputSchema)

export const decideRewordedDraft = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => decideInput.parse(data))
  .handler(({ data }): Promise<TriageOutcome<null>> => {
    const { draftId, ...body } = data

    return run(async () => {
      await request<unknown>(`/reworded-drafts/${encodeURIComponent(draftId)}/decision`, {
        method: 'POST',
        body,
      })

      return null
    })
  })
