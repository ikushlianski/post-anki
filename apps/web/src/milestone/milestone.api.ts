import { createServerFn } from '@tanstack/react-start'

import * as api from './milestone.api-client'

export const listMilestones = createServerFn({ method: 'GET' }).handler(() =>
  api.listMilestones(),
)
