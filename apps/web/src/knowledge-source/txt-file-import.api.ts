import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as api from '../curriculum/api-client'

export interface TxtImportStatus {
  importId: string
  staged: number
  imported: number
  extracted: number
}

export type TxtImportResult =
  | { kind: 'anki'; importId: string; parsed: number; skippedEmpty: number; newlyStaged: number }
  | { kind: 'source'; created: boolean }

function plainError(error: unknown): never {
  if (error instanceof api.ApiError) {
    const message = (error.details as { message?: unknown } | undefined)?.message

    throw new Error(typeof message === 'string' ? message : 'The file could not be imported.')
  }

  throw error
}

export const uploadTxtFile = createServerFn({ method: 'POST' })
  .inputValidator((data: { text: string; subjectId?: string | null }) =>
    z.object({ text: z.string(), subjectId: z.string().min(1).nullable().optional() }).parse(data),
  )
  .handler(({ data }): Promise<TxtImportResult> =>
    api.request<TxtImportResult>('/text-file-imports', { method: 'POST', body: data, timeoutMs: 60_000 }).catch(plainError),
  )

export const getTxtImportStatus = createServerFn({ method: 'GET' })
  .inputValidator((data: { importId: string }) => z.object({ importId: z.string().min(3) }).parse(data))
  .handler(({ data }): Promise<TxtImportStatus> =>
    api.request<TxtImportStatus>(`/text-file-imports/${encodeURIComponent(data.importId)}`),
  )
