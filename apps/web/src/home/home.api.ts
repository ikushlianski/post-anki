import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { HomeSummary, StudyOverview } from '@post-anki/shared'

import * as api from './home.api-client'

export const getHomeSummary = createServerFn({ method: 'GET' }).handler(
  (): Promise<HomeSummary | null> => api.getHomeSummary(),
)

export const getStudyOverview = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) =>
    z
      .object({ tz: z.string().min(1), days: z.number().int().min(1).max(120).optional() })
      .parse(data),
  )
  .handler(({ data }): Promise<StudyOverview> => api.getStudyOverview(data.tz, data.days))
