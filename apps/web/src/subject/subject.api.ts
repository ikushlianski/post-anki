import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { createSubjectInput } from '../curriculum/model'
import type { CreateSubjectInput } from '../curriculum/model'
import * as api from '../curriculum/api-client'

export const createSubject = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateSubjectInput) => createSubjectInput.parse(data))
  .handler(({ data }) => api.createSubject(data))

export const deleteSubject = createServerFn({ method: 'POST' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(async ({ data }) => {
    await api.deleteSubject(data)

    return null
  })
