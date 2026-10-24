import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { modelTierSchema, reorderSubjectsInput, subjectSearchQueryInput } from '@post-anki/shared'
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

const updateSubjectLearningIntentInput = z.object({
  subjectId: z.string(),
  learningIntent: z.string().trim().max(1000),
})

export const updateSubjectLearningIntent = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateSubjectLearningIntentInput.parse(data))
  .handler(({ data }) => api.updateSubjectLearningIntent(data.subjectId, data.learningIntent))

const updateSubjectParentInput = z.object({
  subjectId: z.string(),
  parentId: z.string().nullable(),
})

export const updateSubjectParent = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateSubjectParentInput.parse(data))
  .handler(({ data }) => api.updateSubjectParent(data.subjectId, data.parentId))

const updateSubjectNameInput = z.object({
  subjectId: z.string(),
  name: z.string().min(1),
})

export const updateSubjectName = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateSubjectNameInput.parse(data))
  .handler(({ data }) => api.updateSubjectName(data.subjectId, data.name))

export const reorderSubjects = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => reorderSubjectsInput.parse(data))
  .handler(({ data }) => api.reorderSubjects(data))

export const searchSubjects = createServerFn({ method: 'GET' })
  .inputValidator((query: string) => subjectSearchQueryInput.parse(query))
  .handler(({ data }) => api.searchSubjects(data))

export const deleteSubject = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(async ({ data }) => {
    await api.deleteSubject(data)

    return null
  })

export const mergeSubjects = createServerFn({ method: 'POST' })
  .inputValidator((data: MergeSubjectsInput) => mergeSubjectsInput.parse(data))
  .handler(({ data }) => api.mergeSubjects(data.targetSubjectId, data.sourceSubjectId))
