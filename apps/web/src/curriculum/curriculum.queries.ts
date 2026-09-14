import { queryOptions } from '@tanstack/react-query'

import { getCurriculum, getStructureTurns } from './curriculum.api'
import { getCurriculumCardsSummary } from './cards.api'
import { getCurriculumStats } from './stats.api'

export const curriculumDetailQuery = (curriculumId: string) =>
  queryOptions({
    queryKey: ['curriculum', curriculumId],
    queryFn: () => getCurriculum({ data: curriculumId }),
  })

export const structureTurnsQuery = (curriculumId: string) =>
  queryOptions({
    queryKey: ['curriculum-structure-turns', curriculumId],
    queryFn: () => getStructureTurns({ data: curriculumId }),
  })

// Never stops polling outright, even once `topicsGenerating` hits 0 — a
// learner can confirm structure or trigger a new release while this page
// stays open, starting fresh generation with nothing invalidating this
// query. The slower idle cadence still picks that up on its own.
export const curriculumCardsSummaryQuery = (curriculumId: string) =>
  queryOptions({
    queryKey: ['curriculum-cards-summary', curriculumId],
    queryFn: () => getCurriculumCardsSummary({ data: curriculumId }),
    refetchInterval: (query) => ((query.state.data?.topicsGenerating ?? 0) > 0 ? 3000 : 15000),
  })

export const curriculumStatsQuery = (curriculumId: string) =>
  queryOptions({
    queryKey: ['curriculum-stats', curriculumId],
    queryFn: () => getCurriculumStats({ data: curriculumId }),
  })
