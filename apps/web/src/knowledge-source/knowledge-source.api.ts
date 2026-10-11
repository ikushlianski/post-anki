import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { knowledgeItemModelIdSchema } from '@post-anki/shared'

import * as api from '../curriculum/api-client'

const subjectIdInput = z.string().min(1).nullable().optional()
const modelIdInput = knowledgeItemModelIdSchema.optional()

export interface SubjectScopedText {
  text: string
  subjectId?: string | null
  modelId?: string
}

export interface SubjectScopedTexts {
  texts: string[]
  subjectId?: string | null
  modelId?: string
}

export interface SubjectScopedUrl {
  url: string
  subjectId?: string | null
  modelId?: string
}

export const createKnowledgeSource = createServerFn({ method: 'POST' })
  .inputValidator((data: SubjectScopedText) =>
    z.object({ text: z.string().min(1), subjectId: subjectIdInput, modelId: modelIdInput }).parse(data),
  )
  .handler(({ data }) => api.createKnowledgeSource(data.text, data.subjectId ?? undefined, data.modelId))

export const createKnowledgeSources = createServerFn({ method: 'POST' })
  .inputValidator((data: SubjectScopedTexts) =>
    z
      .object({
        texts: z.array(z.string().min(1)).min(1),
        subjectId: subjectIdInput,
        modelId: modelIdInput,
      })
      .parse(data),
  )
  .handler(({ data }) => api.createKnowledgeSources(data.texts, data.subjectId ?? undefined, data.modelId))

export const createKnowledgeSourceFromUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: SubjectScopedUrl) =>
    z.object({ url: z.string().url(), subjectId: subjectIdInput, modelId: modelIdInput }).parse(data),
  )
  .handler(({ data }) => api.createKnowledgeSourceFromUrl(data.url, data.subjectId ?? undefined, data.modelId))
