import { createServerFn } from '@tanstack/react-start'
import { setKnowledgeBitUserNoteInput } from '@post-anki/shared'
import { z } from 'zod'

import { ApiError, request } from '../curriculum/api-client'

export type SaveUserNoteOutcome = { ok: true; userNote: string | null } | { ok: false; error: string }

const saveInput = setKnowledgeBitUserNoteInput.extend({ id: z.string().min(1) })

export const saveKnowledgeBitUserNote = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data }): Promise<SaveUserNoteOutcome> => {
    try {
      const result = await request<{ userNote: string | null }>(
        `/knowledge-bits/${encodeURIComponent(data.id)}/note`,
        { method: 'PUT', body: { note: data.note } },
      )

      return { ok: true, userNote: result.userNote }
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, error: err.code ?? 'unknown' }
      }

      return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
    }
  })
