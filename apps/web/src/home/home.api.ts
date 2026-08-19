import { createServerFn } from '@tanstack/react-start'
import type { HomeSummary } from '@post-anki/shared'

import * as api from './home.api-client'

export const getHomeSummary = createServerFn({ method: 'GET' }).handler(
  (): Promise<HomeSummary | null> => api.getHomeSummary(),
)
