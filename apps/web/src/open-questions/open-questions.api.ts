import { createServerFn } from '@tanstack/react-start'
import {
  captureOpenQuestionInput,
  resolveOpenQuestionInput,
  type OpenQuestion,
  type OpenQuestionsListResult,
  type OpenQuestionStatus,
} from '@post-anki/shared'
import { z } from 'zod'

import * as api from '../curriculum/api-client'

const captureProbeQuestionOpenQuestionInput = captureOpenQuestionInput.extend({
  questionId: z.string(),
})

const captureSocraticTurnOpenQuestionInput = captureOpenQuestionInput.extend({
  turnId: z.string(),
})

export const captureProbeQuestionOpenQuestion = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => captureProbeQuestionOpenQuestionInput.parse(data))
  .handler(
    ({ data }): Promise<OpenQuestion> =>
      api.captureProbeQuestionOpenQuestion(data.questionId, {
        questionText: data.questionText,
      }),
  )

export const captureSocraticTurnOpenQuestion = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => captureSocraticTurnOpenQuestionInput.parse(data))
  .handler(
    ({ data }): Promise<OpenQuestion> =>
      api.captureSocraticTurnOpenQuestion(data.turnId, {
        questionText: data.questionText,
      }),
  )

const listOpenQuestionsInput = z.object({
  status: z.enum(['open', 'answered', 'dismissed']).optional(),
  limit: z.number().optional(),
})

export const listOpenQuestions = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => listOpenQuestionsInput.parse(data))
  .handler(
    ({ data }): Promise<OpenQuestionsListResult> =>
      api.listOpenQuestions({ status: data.status as OpenQuestionStatus, limit: data.limit }),
  )

const resolveOpenQuestionFnInput = resolveOpenQuestionInput.extend({
  id: z.string(),
})

export const resolveOpenQuestion = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => resolveOpenQuestionFnInput.parse(data))
  .handler(
    ({ data }): Promise<OpenQuestion> =>
      api.resolveOpenQuestion(data.id, {
        status: data.status,
        answerText: data.answerText,
      }),
  )
