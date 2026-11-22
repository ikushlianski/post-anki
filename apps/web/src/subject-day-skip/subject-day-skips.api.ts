import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { request } from '../curriculum/api-client'
import { subjectDaySkipsSchema, type SubjectDaySkips } from '@post-anki/shared'

const tzInput = z.object({ tz: z.string().min(1) })
const toggleInput = tzInput.extend({ subjectId: z.string().min(1) })

export const getSubjectDaySkips = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => tzInput.parse(data))
  .handler(async ({ data }): Promise<SubjectDaySkips> => {
    const body = await request<unknown>(`/subject-day-skips?tz=${encodeURIComponent(data.tz)}`)

    return subjectDaySkipsSchema.parse(body)
  })

export const setSubjectDaySkip = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => toggleInput.extend({ skipped: z.boolean() }).parse(data))
  .handler(async ({ data }): Promise<SubjectDaySkips> => {
    const path = `/subject-day-skips/${encodeURIComponent(data.subjectId)}?tz=${encodeURIComponent(data.tz)}`
    const body = await request<unknown>(path, { method: data.skipped ? 'PUT' : 'DELETE' })

    return subjectDaySkipsSchema.parse(body)
  })
