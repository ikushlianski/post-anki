import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { createStudySessionInput, questionKindSchema } from '@post-anki/shared'

import * as api from './study-session.api-client'

const sessionIdInput = z.string().min(1)

const windowDaysInput = z.number().int().positive().optional()

const endSessionActionInput = z.object({
  sessionId: z.string().min(1),
  userRequestedEnd: z.boolean().optional(),
})

const recordAnswerActionInput = z.object({
  sessionId: z.string().min(1),
  correct: z.boolean(),
})

const pushInput = z.object({
  sessionId: z.string().min(1),
  excludeGapIds: z.array(z.string()),
  mode: questionKindSchema,
})

export const listStudySessions = createServerFn({ method: 'GET' }).handler(() =>
  api.listStudySessions(),
)

export const getStudySessionConsistency = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => windowDaysInput.parse(data))
  .handler(({ data }) => api.getStudySessionConsistency(data))

export const createStudySession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createStudySessionInput.parse(data))
  .handler(({ data }) => api.createStudySession(data))

export const getStudySession = createServerFn({ method: 'GET' })
  .inputValidator((sessionId: unknown) => sessionIdInput.parse(sessionId))
  .handler(({ data }) => api.getStudySession(data))

export const startStudySession = createServerFn({ method: 'POST' })
  .inputValidator((sessionId: unknown) => sessionIdInput.parse(sessionId))
  .handler(({ data }) => api.startStudySession(data))

export const endStudySession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => endSessionActionInput.parse(data))
  .handler(({ data }) =>
    api.endStudySession(data.sessionId, { userRequestedEnd: data.userRequestedEnd }),
  )

export const recordStudySessionAnswer = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => recordAnswerActionInput.parse(data))
  .handler(({ data }) => api.recordStudySessionAnswer(data.sessionId, { correct: data.correct }))

export const getStudySessionPush = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => pushInput.parse(data))
  .handler(({ data }) => api.getStudySessionPush(data))
