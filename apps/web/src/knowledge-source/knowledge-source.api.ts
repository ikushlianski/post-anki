import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as api from '../curriculum/api-client'

export const createKnowledgeSource = createServerFn({ method: 'POST' })
  .inputValidator((text: string) => z.string().min(1).parse(text))
  .handler(({ data }) => api.createKnowledgeSource(data))

export const createKnowledgeSources = createServerFn({ method: 'POST' })
  .inputValidator((texts: string[]) => z.array(z.string().min(1)).min(1).parse(texts))
  .handler(({ data }) => api.createKnowledgeSources(data))

export const createKnowledgeSourceFromUrl = createServerFn({ method: 'POST' })
  .inputValidator((url: string) => z.string().url().parse(url))
  .handler(({ data }) => api.createKnowledgeSourceFromUrl(data))
