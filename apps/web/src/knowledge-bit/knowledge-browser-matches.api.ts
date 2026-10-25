import { createServerFn } from '@tanstack/react-start'
import {
  knowledgeBitBrowserMatchesQuerySchema,
  knowledgeBitBrowserMatchesSchema,
} from '@post-anki/shared'
import type { KnowledgeBitBrowserMatches } from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type KnowledgeBrowserMatchesOutcome =
  | ({ ok: true } & KnowledgeBitBrowserMatches)
  | { ok: false; error: string }

export const getKnowledgeBrowserMatches = createServerFn({ method: 'GET' })
  .inputValidator((data: Record<string, unknown>) => knowledgeBitBrowserMatchesQuerySchema.parse(data))
  .handler(async ({ data }): Promise<KnowledgeBrowserMatchesOutcome> => {
    const params = new URLSearchParams({ q: data.q })

    const text: [string, string | undefined][] = [
      ['subjectId', data.subjectId],
      ['question', data.question],
      ['answer', data.answer],
      ['origins', data.origins?.join(',')],
      ['addedBy', data.addedBy?.join(',')],
      ['link', data.link],
      ['site', data.site],
      ['from', data.from],
      ['to', data.to],
      ['states', data.states?.join(',')],
    ]

    for (const [key, value] of text) {
      if (value) {
        params.set(key, value)
      }
    }

    try {
      const body = await request<unknown>(`/knowledge-bits/browser/matches?${params.toString()}`)

      return { ok: true, ...knowledgeBitBrowserMatchesSchema.parse(body) }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.code ?? 'unknown' }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  })
