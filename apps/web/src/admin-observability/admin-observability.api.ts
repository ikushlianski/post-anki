import { createServerFn } from '@tanstack/react-start'

import type { AdminObservability } from '@post-anki/shared'
import * as api from '../curriculum/api-client'

export const getAdminObservability = createServerFn({ method: 'GET' }).handler(
  (): Promise<AdminObservability> => api.getAdminObservability(),
)
