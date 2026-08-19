import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { modelTierSchema } from '@post-anki/shared'
import { createSubjectInput, mergeSubjectsInput } from '../curriculum/model'
import type { CreateSubjectInput, MergeSubjectsInput } from '../curriculum/model'
import * as api from '../curriculum/api-client'

export const createSubject = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateSubjectInput) => createSubjectInput.parse(data))
  .handler(({ data }) => api.createSubject(data))

const updateSubjectModelTierInput = z.object({
  subjectId: z.string(),
  modelTier: modelTierSchema.nullable(),
})

export const updateSubjectModelTier = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateSubjectModelTierInput.parse(data))
  .handler(({ data }) => api.updateSubjectModelTier(data.subjectId, data.modelTier))

export const deleteSubject = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(async ({ data }) => {
    await api.deleteSubject(data)

    return null
  })

export const mergeSubjects = createServerFn({ method: 'POST' })
  .inputValidator((data: MergeSubjectsInput) => mergeSubjectsInput.parse(data))
  .handler(({ data }) => api.mergeSubjects(data.targetSubjectId, data.sourceSubjectId))
