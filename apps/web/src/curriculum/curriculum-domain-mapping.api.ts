import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  listCurriculumDomainMappings,
  resolveCurriculumDomainMapping,
  triggerCurriculumDomainMapping,
} from './api-client'
import type { CurriculumDomainNodeMapping, Depth } from './model'

// decouple-curricula-from-domain-nodes (issue #84) — server-fn wrappers for
// the three new curriculum-domain-mapping endpoints, same shape as
// domain-map.api.ts's own trigger/list/resolve server fns.

export const triggerDomainMapping = createServerFn({ method: 'POST' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }): Promise<CurriculumDomainNodeMapping[]> =>
    triggerCurriculumDomainMapping(data),
  )

export const getDomainMappingsForCurriculum = createServerFn({ method: 'GET' })
  .inputValidator((curriculumId: string) => z.string().parse(curriculumId))
  .handler(({ data }): Promise<CurriculumDomainNodeMapping[]> =>
    listCurriculumDomainMappings(data),
  )

export const resolveDomainMapping = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { mappingId: string; status: 'confirmed' | 'rejected'; depth?: Depth }) => data,
  )
  .handler(({ data }): Promise<CurriculumDomainNodeMapping> =>
    resolveCurriculumDomainMapping(data.mappingId, data.status, data.depth),
  )
