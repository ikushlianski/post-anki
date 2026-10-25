import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { encodeKnowledgeSourceRefusal, knowledgeItemModelIdSchema, subjectCheckRequestSchema } from '@post-anki/shared'
import type { SubjectCheckResponse } from '@post-anki/shared'

import * as api from '../curriculum/api-client'

const subjectIdInput = z.string().min(1).nullable().optional()
const modelIdInput = knowledgeItemModelIdSchema.optional()
const forceInput = z.boolean().optional()

function rethrowRefusal(error: unknown): never {
  throw encodeKnowledgeSourceRefusal(error)
}

export interface SubjectScopedText {
  text: string
  subjectId?: string | null
  modelId?: string
  force?: boolean
}

export interface SubjectScopedTexts {
  texts: string[]
  subjectId?: string | null
  modelId?: string
  force?: boolean
}

export interface SubjectScopedUrl {
  url: string
  subjectId?: string | null
  modelId?: string
  force?: boolean
}

export const createKnowledgeSource = createServerFn({ method: 'POST' })
  .inputValidator((data: SubjectScopedText) =>
    z.object({ text: z.string().min(1), subjectId: subjectIdInput, modelId: modelIdInput, force: forceInput }).parse(data),
  )
  .handler(({ data }) =>
    api.createKnowledgeSource(data.text, data.subjectId ?? undefined, data.modelId, data.force).catch(rethrowRefusal),
  )

export const createKnowledgeSources = createServerFn({ method: 'POST' })
  .inputValidator((data: SubjectScopedTexts) =>
    z
      .object({
        texts: z.array(z.string().min(1)).min(1),
        subjectId: subjectIdInput,
        modelId: modelIdInput,
        force: forceInput,
      })
      .parse(data),
  )
  .handler(({ data }) =>
    api.createKnowledgeSources(data.texts, data.subjectId ?? undefined, data.modelId, data.force).catch(rethrowRefusal),
  )

export const createKnowledgeSourceFromUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: SubjectScopedUrl) =>
    z.object({ url: z.string().url(), subjectId: subjectIdInput, modelId: modelIdInput, force: forceInput }).parse(data),
  )
  .handler(({ data }) =>
    api.createKnowledgeSourceFromUrl(data.url, data.subjectId ?? undefined, data.modelId, data.force).catch(rethrowRefusal),
  )

export const checkKnowledgeSourceSubject = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => subjectCheckRequestSchema.parse(data))
  .handler(async ({ data }): Promise<SubjectCheckResponse> => {
    try {
      return await api.checkKnowledgeSourceSubject(data)
    } catch {
      return { status: 'unavailable', reason: 'failed' }
    }
  })
