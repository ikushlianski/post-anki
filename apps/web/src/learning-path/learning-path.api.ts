import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import * as api from './learning-path.api-client'

const createLearningPathInput = z.object({
  roleTemplateId: z.string().min(1),
})

const listLearningPathsInput = z.object({
  onlyActive: z.boolean(),
})

const pathIdInput = z.string().min(1)

const stepPushInput = z.object({
  pathId: z.string().min(1),
  stepDomainNodeId: z.string().min(1),
})

export const listRoleTemplates = createServerFn({ method: 'GET' }).handler(() =>
  api.listRoleTemplates(),
)

export const createLearningPath = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => createLearningPathInput.parse(data))
  .handler(({ data }) => api.createLearningPath(data))

export const listLearningPaths = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => listLearningPathsInput.parse(data))
  .handler(({ data }) => api.listLearningPaths(data))

export const getLearningPath = createServerFn({ method: 'GET' })
  .inputValidator((pathId: unknown) => pathIdInput.parse(pathId))
  .handler(({ data }) => api.getLearningPath(data))

export const abandonLearningPath = createServerFn({ method: 'POST' })
  .inputValidator((pathId: unknown) => pathIdInput.parse(pathId))
  .handler(({ data }) => api.abandonLearningPath(data))

export const getLearningPathStepPush = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => stepPushInput.parse(data))
  .handler(({ data }) => api.getLearningPathStepPush(data))
