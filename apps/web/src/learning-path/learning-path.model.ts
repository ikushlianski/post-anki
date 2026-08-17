import { z } from 'zod'

import { dailyPushSchema, learningPathSchema, learningPathStepSchema, probeQuestionSchema } from '@post-anki/shared'

export type ApiFailure = {
  ok: false
  status: number
  code: string
  message: string | null
}

export type ApiSuccess<T> = {
  ok: true
  data: T
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export const createLearningPathResponseSchema = z.object({
  path: learningPathSchema,
  steps: z.array(learningPathStepSchema),
})

export type CreateLearningPathResponse = z.infer<typeof createLearningPathResponseSchema>

export const stepPushResultSchema = z.object({
  push: dailyPushSchema.nullable(),
  question: probeQuestionSchema.nullable(),
})

export type StepPushResult = z.infer<typeof stepPushResultSchema>
