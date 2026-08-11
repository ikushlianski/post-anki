import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { requestStudyMaterialInput } from '@post-anki/shared'

import * as api from './study-material.api-client'

export const requestStudyMaterial = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) =>
    z.object({ topicId: z.string().min(1) }).merge(requestStudyMaterialInput).parse(data),
  )
  .handler(({ data }) => api.requestStudyMaterial(data.topicId, data.kind))

export const listStudyMaterials = createServerFn({ method: 'GET' })
  .inputValidator((topicId: string) => z.string().min(1).parse(topicId))
  .handler(({ data }) => api.listStudyMaterials(data))
