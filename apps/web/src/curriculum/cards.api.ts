import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { TopicCardSet } from './model'
import * as api from './api-client'

export const compileCards = createServerFn({ method: 'POST' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(({ data }): Promise<TopicCardSet> => api.compileCards(data))

export const getCards = createServerFn({ method: 'GET' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(({ data }): Promise<TopicCardSet | null> => api.getCards(data))
