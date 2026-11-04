import { createServerFn } from '@tanstack/react-start'
import { reviewStatisticsQuerySchema } from '@post-anki/shared'

import * as api from './analytics.api-client'

export const getCoverageReport = createServerFn({ method: 'GET' }).handler(() =>
  api.getCoverageReport(),
)

export const getRetentionReport = createServerFn({ method: 'GET' }).handler(() =>
  api.getRetentionReport(),
)

export const getWeeklyDigest = createServerFn({ method: 'GET' }).handler(() =>
  api.getWeeklyDigest(),
)

export const getReviewStatistics = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => reviewStatisticsQuerySchema.parse(data))
  .handler(({ data }) => api.getReviewStatistics(data))

export const getRejectReasonsStatistics = createServerFn({ method: 'GET' }).handler(() =>
  api.getRejectReasonsStatistics(),
)

export const getNothingExtractedStatistics = createServerFn({ method: 'GET' }).handler(() =>
  api.getNothingExtractedStatistics(),
)

export const getWeeklyDigestCard = createServerFn({ method: 'GET' }).handler(() =>
  api.getWeeklyDigestCard(),
)

export const getChatQueueOutcomesStatistics = createServerFn({ method: 'GET' }).handler(() =>
  api.getChatQueueOutcomesStatistics(),
)
