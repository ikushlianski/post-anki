import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  createSubjectPriorityInput,
  putAddKnowledgeGoalInput,
  updateDailyGoalInput,
  updateSubjectPriorityInput,
  type AddKnowledgeGoalList,
  type AddKnowledgeGoalProgressList,
  type DailyGoal,
  type DailyGoalProgress,
  type SubjectPriority,
  type SubjectPriorityList,
} from '@post-anki/shared'
import { request } from '../curriculum/api-client'

const idSchema = z.string().min(1)
const tzSchema = z.string().min(1)

export const getDailyGoal = createServerFn({ method: 'GET' }).handler(
  (): Promise<DailyGoal> => request<DailyGoal>('/study-goal/daily'),
)

export const saveDailyGoal = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateDailyGoalInput.parse(data))
  .handler(
    ({ data }): Promise<DailyGoal> => request<DailyGoal>('/study-goal/daily', { method: 'PUT', body: data }),
  )

export const getDailyGoalProgress = createServerFn({ method: 'GET' })
  .inputValidator((tz: string) => tzSchema.parse(tz))
  .handler(
    ({ data }): Promise<DailyGoalProgress> =>
      request<DailyGoalProgress>(`/study-goal/daily/progress?tz=${encodeURIComponent(data)}`),
  )

export const listSubjectPriorities = createServerFn({ method: 'GET' })
  .inputValidator((data: { subjectId: string; tz: string }) =>
    z.object({ subjectId: idSchema, tz: tzSchema }).parse(data),
  )
  .handler(
    ({ data }): Promise<SubjectPriorityList> =>
      request<SubjectPriorityList>(
        `/subjects/${encodeURIComponent(data.subjectId)}/priorities?includeDescendants=true&tz=${encodeURIComponent(data.tz)}`,
      ),
  )

export const listCurrentPriorities = createServerFn({ method: 'GET' })
  .inputValidator((tz: string) => tzSchema.parse(tz))
  .handler(
    ({ data }): Promise<SubjectPriorityList> =>
      request<SubjectPriorityList>(`/priorities?period=week&tz=${encodeURIComponent(data)}`),
  )

const createForSubject = z.object({
  subjectId: idSchema,
  tz: tzSchema,
  priority: createSubjectPriorityInput,
})

export const createSubjectPriority = createServerFn({ method: 'POST' })
  .inputValidator((data: z.input<typeof createForSubject>) => createForSubject.parse(data))
  .handler(
    ({ data }): Promise<SubjectPriority> =>
      request<SubjectPriority>(
        `/subjects/${encodeURIComponent(data.subjectId)}/priorities?tz=${encodeURIComponent(data.tz)}`,
        { method: 'POST', body: data.priority },
      ),
  )

const updateForPriority = z.object({ id: idSchema, tz: tzSchema, patch: updateSubjectPriorityInput })

export const updateSubjectPriority = createServerFn({ method: 'POST' })
  .inputValidator((data: z.input<typeof updateForPriority>) => updateForPriority.parse(data))
  .handler(
    ({ data }): Promise<SubjectPriority> =>
      request<SubjectPriority>(`/priorities/${encodeURIComponent(data.id)}?tz=${encodeURIComponent(data.tz)}`, {
        method: 'PATCH',
        body: data.patch,
      }),
  )

export const deleteSubjectPriority = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => idSchema.parse(id))
  .handler(
    ({ data }): Promise<{ deleted: true }> =>
      request<{ deleted: true }>(`/priorities/${encodeURIComponent(data)}`, { method: 'DELETE' }),
  )

export const listAddKnowledgeGoals = createServerFn({ method: 'GET' }).handler(
  (): Promise<AddKnowledgeGoalList> => request<AddKnowledgeGoalList>('/add-knowledge-goals'),
)

export const listAddKnowledgeGoalProgress = createServerFn({ method: 'GET' })
  .inputValidator((tz: string) => tzSchema.parse(tz))
  .handler(
    ({ data }): Promise<AddKnowledgeGoalProgressList> =>
      request<AddKnowledgeGoalProgressList>(`/add-knowledge-goals/progress?tz=${encodeURIComponent(data)}`),
  )

export const saveAddKnowledgeGoal = createServerFn({ method: 'POST' })
  .inputValidator((data: z.input<typeof putAddKnowledgeGoalInput>) => putAddKnowledgeGoalInput.parse(data))
  .handler(
    ({ data }): Promise<{ id: string }> =>
      request<{ id: string }>('/add-knowledge-goals', { method: 'PUT', body: data }),
  )

export const deleteAddKnowledgeGoal = createServerFn({ method: 'POST' })
  .inputValidator((id: string) => idSchema.parse(id))
  .handler(
    ({ data }): Promise<{ deleted: true }> =>
      request<{ deleted: true }>(`/add-knowledge-goals/${encodeURIComponent(data)}`, { method: 'DELETE' }),
  )
