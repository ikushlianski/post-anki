import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  captureLearningListItemInput,
  chosenLearningListDestinationSchema,
  depthLevelSchema,
  learningStatusSchema,
  nudgeResponseInputSchema,
} from '@post-anki/shared'

import * as api from './learning-list.api-client'

const resolveRecommendationInput = z.object({
  itemId: z.string().min(1),
  decision: z.enum(['approve', 'decline']),
})

const chooseDestinationInput = z.object({
  itemId: z.string().min(1),
  destination: chosenLearningListDestinationSchema,
})

const classifyLearningListItemInput = z.object({
  itemId: z.string().min(1),
  subjectId: z.string().min(1),
  subSubjectNodeId: z.string().min(1).nullable(),
})

const electTopicDepthInput = z.object({
  topicId: z.string().min(1),
  depth: depthLevelSchema,
  learningStatus: learningStatusSchema,
  depthElectedAt: z.string().min(1).optional(),
})

const declineHeadroomOfferInput = z.object({
  topicId: z.string().min(1),
  headroomOfferedAt: z.string().min(1),
})

export const captureLearningListItem = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => captureLearningListItemInput.parse(data))
  .handler(({ data }) => api.captureLearningListItem(data))

export const listLearningListItems = createServerFn({ method: 'GET' }).handler(
  () => api.listLearningListItems(),
)

export const getLearningListItem = createServerFn({ method: 'GET' })
  .inputValidator((itemId: unknown) => z.string().min(1).parse(itemId))
  .handler(({ data }) => api.getLearningListItem(data))

export const resolveRecommendation = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => resolveRecommendationInput.parse(data))
  .handler(({ data }) => api.resolveRecommendation(data))

export const chooseLearningListDestination = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => chooseDestinationInput.parse(data))
  .handler(({ data }) => api.chooseLearningListDestination(data))

export const classifyLearningListItem = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => classifyLearningListItemInput.parse(data))
  .handler(({ data }) => api.classifyLearningListItem(data))

export const respondToNudge = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => nudgeResponseInputSchema.parse(data))
  .handler(({ data }) => api.respondToNudge(data))

export const electTopicDepth = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => electTopicDepthInput.parse(data))
  .handler(({ data }) => api.electTopicDepth(data))

export const declineHeadroomOffer = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => declineHeadroomOfferInput.parse(data))
  .handler(({ data }) => api.declineHeadroomOffer(data))
