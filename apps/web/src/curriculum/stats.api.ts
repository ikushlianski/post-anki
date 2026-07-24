import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { CurriculumStats, GenerateRecommendationsResult, Streak } from '@post-anki/shared'

import * as api from './api-client'

export const getCurriculumStats = createServerFn({ method: 'GET' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }): Promise<CurriculumStats | null> => api.getCurriculumStats(data))

export const generateRecommendations = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(
    ({ data }): Promise<GenerateRecommendationsResult | null> =>
      api.generateRecommendations(data),
  )

export const getStreak = createServerFn({ method: 'GET' }).handler(
  (): Promise<Streak | null> => api.getStreak(),
)
