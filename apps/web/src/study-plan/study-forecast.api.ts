import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { StudyForecast } from '@post-anki/shared'
import { request } from '../curriculum/api-client'

const forecastInput = z.object({
  subjectId: z.string().min(1),
  tz: z.string().min(1).optional(),
})

export const getStudyForecast = createServerFn({ method: 'GET' })
  .inputValidator((data: z.input<typeof forecastInput>) => forecastInput.parse(data))
  .handler(({ data }): Promise<StudyForecast> => {
    const query = data.tz ? `?tz=${encodeURIComponent(data.tz)}` : ''

    return request<StudyForecast>(`/subjects/${encodeURIComponent(data.subjectId)}/study-forecast${query}`)
  })

export function browserTimeZone(): string | undefined {
  return typeof window === 'undefined' ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone
}
