import { queryOptions } from '@tanstack/react-query'

import { getCurriculum, getStructureTurns } from './curriculum.api'
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

export const curriculumStatsQuery = (curriculumId: string) =>
  queryOptions({
    queryKey: ['curriculum-stats', curriculumId],
    queryFn: () => getCurriculumStats({ data: curriculumId }),
  })
