import { createServerFn } from '@tanstack/react-start'

import {
  gradeQuestionVariantAnswer,
  listNextQuestionVariants,
} from '../curriculum/api-client'
import type {
  GradeQuestionVariantAnswerResult,
  NextQuestionVariant,
} from '../curriculum/api-client'

export const getNextQuestionVariants = createServerFn({ method: 'GET' })
  .inputValidator((data: { limit?: number; tagId?: string; topicId?: string }) => data)
  .handler(({ data }): Promise<NextQuestionVariant[]> =>
    listNextQuestionVariants(data.limit, data.tagId, data.topicId),
  )

export const gradeQuestionVariant = createServerFn({ method: 'POST' })
  .inputValidator((data: { variantId: string; userAnswer: string }) => data)
  .handler(({ data }): Promise<GradeQuestionVariantAnswerResult> =>
    gradeQuestionVariantAnswer(data.variantId, data.userAnswer),
  )
