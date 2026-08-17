import { z } from 'zod'

import {
  learningListItemSchema,
  livenessStatusSchema,
} from '@post-anki/shared'

export const learningListItemWithLivenessSchema = learningListItemSchema.extend({
  liveness: livenessStatusSchema.nullable(),
})

export type LearningListItemWithLiveness = z.infer<
  typeof learningListItemWithLivenessSchema
>

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
