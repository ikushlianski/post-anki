import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CurriculumDetail, Gap, GapStatus, Module, Priority, Topic } from './model'
import { curateGap, setTopicState, updateModule } from './curriculum.api'
import { curriculumDetailQuery } from './curriculum.queries'

type Detail = CurriculumDetail

function patchTopic(
  detail: Detail,
  topicId: string,
  fn: (topic: Topic) => Topic,
): Detail {
  return {
    ...detail,
    modules: detail.modules.map((module) => ({
      ...module,
      topics: module.topics.map((topic) =>
        topic.id === topicId ? fn(topic) : topic,
      ),
    })),
  }
}

function patchModule(
  detail: Detail,
  moduleId: string,
  fn: (module: Module) => Module,
): Detail {
  return {
    ...detail,
    modules: detail.modules.map((module) =>
      module.id === moduleId ? fn(module) : module,
    ),
  }
}

function patchGap(
  detail: Detail,
  gapId: string,
  fn: (gap: Gap) => Gap,
): Detail {
  return {
    ...detail,
    modules: detail.modules.map((module) => ({
      ...module,
      topics: module.topics.map((topic) => ({
        ...topic,
        gaps: topic.gaps.map((gap) => (gap.id === gapId ? fn(gap) : gap)),
      })),
    })),
  }
}

export function useToggleTopicIncluded(curriculumId: string) {
  const queryClient = useQueryClient()
  const queryKey = curriculumDetailQuery(curriculumId).queryKey

  return useMutation({
    mutationFn: (vars: { topicId: string; included: boolean }) =>
      setTopicState({
        data: { topicId: vars.topicId, included: vars.included },
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey })

      const prev = queryClient.getQueryData<Detail | null>(queryKey)

      if (prev) {
        queryClient.setQueryData<Detail | null>(
          queryKey,
          patchTopic(prev, vars.topicId, (topic) => ({
            ...topic,
            included: vars.included,
          })),
        )
      }

      return { prev }
    },
    onError: (_error, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKey, context.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function usePromoteDemoteTopic(curriculumId: string) {
  const queryClient = useQueryClient()
  const queryKey = curriculumDetailQuery(curriculumId).queryKey

  return useMutation({
    mutationFn: (vars: { topicId: string; priority: Priority }) =>
      setTopicState({ data: { topicId: vars.topicId, priority: vars.priority } }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey })

      const prev = queryClient.getQueryData<Detail | null>(queryKey)

      if (prev) {
        queryClient.setQueryData<Detail | null>(
          queryKey,
          patchTopic(prev, vars.topicId, (topic) => ({
            ...topic,
            priority: vars.priority,
          })),
        )
      }

      return { prev }
    },
    onError: (_error, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKey, context.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function usePromoteDemoteModule(curriculumId: string) {
  const queryClient = useQueryClient()
  const queryKey = curriculumDetailQuery(curriculumId).queryKey

  return useMutation({
    mutationFn: (vars: { moduleId: string; priority: Priority }) =>
      updateModule({ data: { moduleId: vars.moduleId, priority: vars.priority } }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey })

      const prev = queryClient.getQueryData<Detail | null>(queryKey)

      if (prev) {
        queryClient.setQueryData<Detail | null>(
          queryKey,
          patchModule(prev, vars.moduleId, (module) => ({
            ...module,
            priority: vars.priority,
          })),
        )
      }

      return { prev }
    },
    onError: (_error, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKey, context.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function useCurateGap(curriculumId: string) {
  const queryClient = useQueryClient()
  const queryKey = curriculumDetailQuery(curriculumId).queryKey

  return useMutation({
    mutationFn: (vars: {
      gapId: string
      wanted?: boolean
      status?: GapStatus
    }) =>
      curateGap({
        data: { gapId: vars.gapId, wanted: vars.wanted, status: vars.status },
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey })

      const prev = queryClient.getQueryData<Detail | null>(queryKey)

      if (prev) {
        queryClient.setQueryData<Detail | null>(
          queryKey,
          patchGap(prev, vars.gapId, (gap) => ({
            ...gap,
            wanted: vars.wanted ?? gap.wanted,
            status: vars.status ?? gap.status,
          })),
        )
      }

      return { prev }
    },
    onError: (_error, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKey, context.prev)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
}
