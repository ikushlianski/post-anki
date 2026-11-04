import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  updateSubjectStudyOptionsInput,
  type SubjectStudyOptions,
} from '@post-anki/shared'
import { ApiError, request } from '../curriculum/api-client'
import { examDateMessageFor } from '../study-plan/exam-date-messages'

const subjectIdSchema = z.string().min(1)

const updateForSubject = z.object({
  subjectId: subjectIdSchema,
  patch: updateSubjectStudyOptionsInput,
})

export const getSubjectStudyOptions = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => subjectIdSchema.parse(subjectId))
  .handler(
    ({ data }): Promise<SubjectStudyOptions> =>
      request<SubjectStudyOptions>(`/subjects/${encodeURIComponent(data)}/study-options`),
  )

export const updateSubjectStudyOptions = createServerFn({ method: 'POST' })
  .inputValidator((data: z.input<typeof updateForSubject>) => updateForSubject.parse(data))
  .handler(
    ({ data }): Promise<SubjectStudyOptions> =>
      request<SubjectStudyOptions>(`/subjects/${encodeURIComponent(data.subjectId)}/study-options`, {
        method: 'PATCH',
        body: data.patch,
      }).catch((error: unknown) => {
        const message = error instanceof ApiError ? examDateMessageFor(error.code) : null

        throw message ? new Error(message) : error
      }),
  )
