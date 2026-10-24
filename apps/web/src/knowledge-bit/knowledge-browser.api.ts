import { createServerFn } from '@tanstack/react-start'
import {
  knowledgeBitBrowserPageSchema,
  knowledgeBitBrowserQuerySchema,
  knowledgeBitBrowserSubjectCountsSchema,
} from '@post-anki/shared'
import type {
  KnowledgeBitBrowserPage,
  KnowledgeBitBrowserQuery,
  KnowledgeBitBrowserSubjectCounts,
} from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type KnowledgeBrowserOutcome =
  | ({ ok: true } & KnowledgeBitBrowserPage)
  | { ok: false; error: string }

export type KnowledgeBrowserCountsOutcome =
  | { ok: true; counts: KnowledgeBitBrowserSubjectCounts }
  | { ok: false; error: string }

function toFailure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.code ?? 'unknown' }
  }

  return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
}

export const listKnowledgeBrowser = createServerFn({ method: 'GET' })
  .inputValidator((data: Partial<KnowledgeBitBrowserQuery>) =>
    knowledgeBitBrowserQuerySchema.parse(data),
  )
  .handler(async ({ data }): Promise<KnowledgeBrowserOutcome> => {
    const params = new URLSearchParams({ limit: String(data.limit), offset: String(data.offset) })

    if (data.subjectId) {
      params.set('subjectId', data.subjectId)
    }

    try {
      const body = await request<unknown>(`/knowledge-bits/browser?${params.toString()}`)

      return { ok: true, ...knowledgeBitBrowserPageSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  })

export const listKnowledgeBrowserSubjectCounts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<KnowledgeBrowserCountsOutcome> => {
    try {
      const body = await request<unknown>('/knowledge-bits/browser/subjects')

      return { ok: true, counts: knowledgeBitBrowserSubjectCountsSchema.parse(body) }
    } catch (err) {
      return toFailure(err)
    }
  },
)
