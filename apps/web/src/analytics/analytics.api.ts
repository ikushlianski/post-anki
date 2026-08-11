import { createServerFn } from '@tanstack/react-start'

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
