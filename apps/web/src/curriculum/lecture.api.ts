import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { reviewLectureSourceCandidateInput, type Lecture, type LectureSourceCandidate } from './model'
import * as api from './api-client'

export const gatherLectureSources = createServerFn({ method: 'POST' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(({ data }): Promise<LectureSourceCandidate[]> => api.gatherLectureSources(data))

export const listLectureSourceCandidates = createServerFn({ method: 'GET' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(({ data }): Promise<LectureSourceCandidate[]> => api.listLectureSourceCandidates(data))

export const reviewLectureSourceCandidate = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => reviewLectureSourceCandidateInput.parse(data))
  .handler(({ data }): Promise<void> => api.reviewLectureSourceCandidate(data))

export const compileLecture = createServerFn({ method: 'POST' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(({ data }): Promise<Lecture> => api.compileLecture(data))

export const getLecture = createServerFn({ method: 'GET' })
  .inputValidator((topicId: string) => z.string().parse(topicId))
  .handler(({ data }): Promise<Lecture | null> => api.getLecture(data))
