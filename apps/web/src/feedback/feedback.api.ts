import { createServerFn } from '@tanstack/react-start'
import { submitItemFeedbackInput, type ItemFeedback } from '@post-anki/shared'
import { z } from 'zod'

import * as api from '../curriculum/api-client'

const submitProbeQuestionFeedbackInput = submitItemFeedbackInput.extend({
  questionId: z.string(),
})

const submitSocraticTurnFeedbackInput = submitItemFeedbackInput.extend({
  turnId: z.string(),
})

export const submitProbeQuestionFeedback = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => submitProbeQuestionFeedbackInput.parse(data))
  .handler(
    ({ data }): Promise<ItemFeedback> =>
      api.submitProbeQuestionFeedback(data.questionId, {
        rating: data.rating,
        comment: data.comment,
      }),
  )

export const submitSocraticTurnFeedback = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => submitSocraticTurnFeedbackInput.parse(data))
  .handler(
    ({ data }): Promise<ItemFeedback> =>
      api.submitSocraticTurnFeedback(data.turnId, {
        rating: data.rating,
        comment: data.comment,
      }),
  )
