import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { submitAttemptsInput, updatePracticeSettingsInput } from '@post-anki/shared'

import * as api from './practice.api-client'

const subjectIdSchema = z.string().min(1)

const updatePracticeSettingsForSubject = updatePracticeSettingsInput.extend({
  subjectId: subjectIdSchema,
})

const submitAttemptsForSubject = submitAttemptsInput.extend({
  subjectId: subjectIdSchema,
})

export const getPracticeSettings = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => subjectIdSchema.parse(subjectId))
  .handler(({ data }) => api.getPracticeSettings(data))

export const updatePracticeSettings = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof updatePracticeSettingsForSubject>) =>
    updatePracticeSettingsForSubject.parse(data),
  )
  .handler(({ data }) => api.updatePracticeSettings(data))

export const generatePhraseBatch = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => subjectIdSchema.parse(subjectId))
  .handler(({ data }) => api.generatePhraseBatch(data))

export const submitAttempts = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof submitAttemptsForSubject>) =>
    submitAttemptsForSubject.parse(data),
  )
  .handler(({ data }) => api.submitAttempts(data))
