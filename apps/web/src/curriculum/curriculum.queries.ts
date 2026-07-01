import { queryOptions } from '@tanstack/react-query'

import { getCurriculum } from './curriculum.api'

export const curriculumDetailQuery = (curriculumId: string) =>
  queryOptions({
    queryKey: ['curriculum', curriculumId],
    queryFn: () => getCurriculum({ data: curriculumId }),
  })
