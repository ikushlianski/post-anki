import { createServerFn } from '@tanstack/react-start'

import * as api from './stats.api-client'
import { statsQuerySchema } from './stats.types'

export const getLearningStats = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => statsQuerySchema.parse(data))
  .handler(({ data }) => api.getLearningStats(data))

export const getAiSpend = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => statsQuerySchema.parse(data))
  .handler(({ data }) => api.getAiSpend(data))
